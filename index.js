const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

// Iniciar servidor Express
const app = express();
const port = process.env.PORT || 3000;

// Configurar body-parser para recibir datos JSON y datos urlencoded
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // <-- Esto permite procesar application/x-www-form-urlencoded

// Configurar la base de datos SQLite
const db = new sqlite3.Database('sigfox.db', (err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite');
  }
});

// Crear la tabla 'datos' si no existe
db.run(`
  CREATE TABLE IF NOT EXISTS datos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device TEXT,
    time INTEGER,
    station TEXT,
    data TEXT,
    rssi TEXT,
    seq TEXT,
    type TEXT
  )
`);

// Ruta para recibir el callback de Sigfox y guardar los datos
app.post('/callback', (req, res) => {
  const { device, time, station, data, rssi, seq, type } = req.body;

  // Imprimir el callback recibido en la consola del servidor
  console.log('📥 Callback recibido:', req.body);

  // Asegurándonos de que los datos sean correctamente formateados
  const formattedData = JSON.stringify(data); // Si 'data' es un objeto, lo convertimos en string
  const formattedRssi = rssi ? rssi.toString() : 'N/A'; // Si 'rssi' es un valor numérico u objeto, lo convertimos en string
  const formattedSeq = seq ? seq.toString() : 'N/A';
  const formattedType = type ? type.toString() : 'N/A';

  db.run(`
    INSERT INTO datos (device, time, station, data, rssi, seq, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [device, time, station, formattedData, formattedRssi, formattedSeq, formattedType], (err) => {
    if (err) {
      console.error('❌ Error al guardar en la base de datos:', err.message);
      return res.status(500).send('Error');
    }
    console.log('✅ Callback recibido y guardado');
    res.status(200).send('OK');
  });
});

// Ruta para ver los datos de la base de datos
app.get('/ver-db', (req, res) => {
  db.all('SELECT * FROM datos', (err, rows) => {
    if (err) return res.status(500).send('Error al cargar datos');

    let html = `<h1>Datos en la Base de Datos</h1>
    <table border="1" cellpadding="5" cellspacing="0">
      <tr><th>ID</th><th>Device</th><th>Time</th><th>Station</th><th>Data</th><th>RSSI</th><th>Seq</th><th>Type</th></tr>`;

    rows.forEach(row => {
      // Convertimos el 'data' JSON a texto si es necesario
      let data = JSON.parse(row.data);
      let formattedData = data ? JSON.stringify(data) : 'No data';
      
      html += `<tr>
        <td>${row.id}</td>
        <td>${row.device}</td>
        <td>${new Date(parseInt(row.time) * 1000).toLocaleString()}</td>
        <td>${row.station}</td>
        <td>${formattedData}</td>
        <td>${row.rssi}</td>
        <td>${row.seq}</td>
        <td>${row.type}</td>
      </tr>`;
    });

    html += `</table>`;
    res.send(html);
  });
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
