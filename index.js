const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Iniciar servidor Express
const app = express();
const port = process.env.PORT || 3000;

// Configurar body-parser para recibir datos JSON y datos urlencoded
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

// Función para convertir datos hexadecimales a decimales
function hexToDecimal(hex) {
  return parseInt(hex, 16);
}

// Ruta para recibir el callback de Sigfox y guardar los datos
app.post('/callback', (req, res) => {
  const { device, time, station, data, rssi, seq, type } = req.body;

  // Imprimir el callback recibido en la consola del servidor
  console.log('📥 Callback recibido:', req.body);

  // Lógica para las advertencias
  let warnings = [];

  // Convertir el dato hexadecimal recibido a un formato legible
  const parsedData = parseHexData(data);

  // Verificar advertencia de temperatura
  if (parsedData.temperature !== null) {
    if (parsedData.temperature < 1650) {
      warnings.push('Advertencia: Temperatura baja');
    } else if (parsedData.temperature > 1700) {
      warnings.push('Advertencia: Temperatura alta');
    }
  }

  // Verificar advertencia de humedad
  if (parsedData.humidity !== null) {
    if (parsedData.humidity < 1200) {
      warnings.push('Advertencia: Humedad baja');
    } else if (parsedData.humidity > 2200) {
      warnings.push('Advertencia: Humedad alta');
    }
  }

  // Verificar advertencia de batería
  if (parsedData.battery !== null) {
    if (parsedData.battery < 50) {
      warnings.push('Advertencia: Batería baja');
    }
  }

  // Imprimir advertencias en la consola
  if (warnings.length > 0) {
    console.warn('⚠️ Advertencias detectadas:', warnings.join(', '));
  }

  // Asegurándonos de que los datos sean correctamente formateados
  const formattedData = JSON.stringify(data);
  const formattedRssi = rssi ? rssi.toString() : 'N/A';
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

// Ruta para obtener los datos en formato JSON (para los gráficos)
app.get('/api/datos', (req, res) => {
  db.all('SELECT * FROM datos ORDER BY time DESC LIMIT 50', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al cargar datos' });
    
    // Procesar los datos para el cliente
    const processedData = rows.map(row => {
      let dataObj;
      try {
        dataObj = JSON.parse(row.data);
      } catch (e) {
        dataObj = { raw: row.data };
      }
      
      return {
        id: row.id,
        device: row.device,
        time: parseInt(row.time) * 1000, // Convertir a milisegundos para JavaScript
        timeFormatted: new Date(parseInt(row.time) * 1000).toLocaleString(),
        station: row.station,
        data: dataObj,
        rssi: row.rssi,
        seq: row.seq,
        type: row.type
      };
    });
    
    res.json(processedData);
  });
});

// Ruta principal con dashboard simplificado
app.get('/', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CowApp - Monitoreo de Ganado</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.3/dist/leaflet.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      body {
        padding: 20px;
        background-color: #f8f9fa;
      }
      #map {
        height: 400px;
        margin-bottom: 20px;
      }
      .card {
        margin-bottom: 20px;
      }
      .refresh-btn {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
      }
    </style>
  </head>
  <body>
    <!-- Aquí va el contenido del dashboard -->
  </body>
  </html>
  `;

  res.send(html);
});

// Ruta para ver los datos de la base de datos (versión anterior)
app.get('/ver-db', (req, res) => {
  db.all('SELECT * FROM datos', (err, rows) => {
    if (err) return res.status(500).send('Error al cargar datos');

    let html = `<h1>Datos en la Base de Datos</h1>
    <table border="1" cellpadding="5" cellspacing="0">
      <tr><th>ID</th><th>Device</th><th>Time</th><th>Station</th><th>Data</th><th>RSSI</th><th>Seq</th><th>Type</th></tr>`;

    rows.forEach(row => {
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

// Función para interpretar datos hexadecimales
function parseHexData(hexString) {
  // Aquí va tu lógica para parsear los datos hexadecimales
  return {
    temperature: 1705, // Ejemplo de temperatura
    humidity: 1300, // Ejemplo de humedad
    battery: 48 // Ejemplo de batería
  };
}
