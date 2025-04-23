// index.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');

const app = express();
const db = new sqlite3.Database('./sigfox.db');
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Crear tabla si no existe
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS datos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device TEXT,
      time TEXT,
      station TEXT,
      data TEXT,
      rssi TEXT,
      seq TEXT,
      type TEXT
    )
  `);
});

// Ruta para recibir callback
app.post('/callback', (req, res) => {
  const { id, time, station, data, rssi, seq, type } = req.body;

  db.run(`
    INSERT INTO datos (device, time, station, data, rssi, seq, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, time, station, data, rssi, seq, type], (err) => {
    if (err) {
      console.error('❌ Error al guardar en la base de datos:', err.message);
      return res.status(500).send('Error');
    }
    console.log('✅ Callback recibido y guardado');
    res.status(200).send('OK');
  });
});

// Ruta para mostrar dashboard
app.get('/', (req, res) => {
  db.all('SELECT * FROM datos ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).send('Error al cargar datos');

    let html = `<h1>Dashboard de Ganado Sigfox</h1>
    <table border="1" cellpadding="5" cellspacing="0">
      <tr><th>Device</th><th>Time</th><th>Station</th><th>Data</th><th>RSSI</th><th>Seq</th><th>Type</th></tr>`;

    rows.forEach(row => {
      html += `<tr>
        <td>${row.device}</td>
        <td>${new Date(parseInt(row.time) * 1000).toLocaleString()}</td>
        <td>${row.station}</td>
        <td>${row.data}</td>
        <td>${row.rssi}</td>
        <td>${row.seq}</td>
        <td>${row.type}</td>
      </tr>`;
    });

    html += `</table>`;
    res.send(html);
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
