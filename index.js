const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./datos.db');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Crear tabla si no existe
db.run(`
  CREATE TABLE IF NOT EXISTS datos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device TEXT,
    time TEXT,
    station TEXT,
    data TEXT,
    data_decoded TEXT,
    rssi TEXT,
    seq TEXT,
    type TEXT
  )
`);

// Función para convertir hexadecimal a decimal (asume datos de 2 bytes)
function parseHexData(hexString) {
  const result = [];
  for (let i = 0; i < hexString.length; i += 4) {
    const hexPair = hexString.substring(i, i + 4);
    const decimal = parseInt(hexPair, 16);
    result.push(decimal);
  }
  return result.join(', ');
}

// Ruta para recibir el callback de Sigfox
app.post('/callback', (req, res) => {
  const { id, time, station, data, rssi, seq, type, device } = req.body;

  // Convierte data hexadecimal a decimal
  const decoded = parseHexData(data);

  db.run(`
    INSERT INTO datos (device, time, station, data, data_decoded, rssi, seq, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [device || id, time, station, data, decoded, rssi, seq, type], (err) => {
    if (err) {
      console.error('Error al guardar en base de datos:', err.message);
      return res.status(500).send('Error');
    }
    console.log('📩 Datos recibidos del callback:', req.body);
    res.status(200).send('OK');
  });
});

// Ruta para ver la base de datos
app.get('/ver-db', (req, res) => {
  db.all('SELECT * FROM datos ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      console.error('Error al leer base de datos:', err.message);
      return res.status(500).send('Error');
    }

    let html = `
      <h1>📊 Datos recibidos desde Sigfox</h1>
      <table border="1" cellpadding="5">
        <tr>
          <th>ID</th><th>Device</th><th>Time</th><th>Station</th><th>Data (Hex)</th>
          <th>Data (Dec)</th><th>RSSI</th><th>Seq</th><th>Type</th>
        </tr>
    `;

    rows.forEach(row => {
      html += `
        <tr>
          <td>${row.id}</td>
          <td>${row.device}</td>
          <td>${row.time}</td>
          <td>${row.station}</td>
          <td>${row.data}</td>
          <td>${row.data_decoded}</td>
          <td>${row.rssi}</td>
          <td>${row.seq}</td>
          <td>${row.type}</td>
        </tr>
      `;
    });

    html += '</table>';
    res.send(html);
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
