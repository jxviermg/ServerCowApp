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
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      body {
        padding: 20px;
        background-color: #f8f9fa;
      }
      .alert {
        margin-bottom: 10px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1 class="mb-4">CowApp - Monitoreo de Ganado</h1>

      <!-- Sección de Advertencias -->
      <div id="warnings" class="mb-4">
        <h2>Advertencias</h2>
        <div id="warningMessages"></div>
      </div>

      <!-- Datos en tiempo real -->
      <div class="mb-4">
        <h2>Datos en Tiempo Real</h2>
        <p><strong>Temperatura:</strong> <span id="temperature">--</span></p>
        <p><strong>Humedad:</strong> <span id="humidity">--</span></p>
        <p><strong>Batería:</strong> <span id="battery">--</span></p>
      </div>

      <!-- Gráfico de temperatura -->
      <div>
        <h2>Gráfico de Temperatura</h2>
        <canvas id="temperatureChart"></canvas>
      </div>
    </div>

    <script>
      let temperatureChart;

      // Inicializar gráfico de temperatura
      function initTemperatureChart() {
        const ctx = document.getElementById('temperatureChart').getContext('2d');
        temperatureChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: [],
            datasets: [{
              label: 'Temperatura (°C)',
              data: [],
              borderColor: '#28a745',
              borderWidth: 2,
              tension: 0.3,
              fill: false
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: false
              }
            }
          }
        });
      }

      // Cargar datos desde la API
      function loadData() {
        fetch('/api/datos')
          .then(response => response.json())
          .then(data => {
            if (data.length > 0) {
              const latestData = data[0];
              updateDashboard(latestData);
            }
          })
          .catch(error => console.error('Error al cargar datos:', error));
      }

      // Actualizar el dashboard
      function updateDashboard(data) {
        const temperature = parseFloat(data.data.temperature);
        const humidity = parseFloat(data.data.humidity);
        const battery = parseFloat(data.data.battery);

        // Actualizar valores en la página
        document.getElementById('temperature').textContent = temperature + ' °C';
        document.getElementById('humidity').textContent = humidity + ' %';
        document.getElementById('battery').textContent = battery + ' V';

        // Actualizar advertencias
        const warningMessages = [];
        if (temperature < 1650) {
          warningMessages.push('<div class="alert alert-danger">Advertencia: Temperatura baja (< 1650)</div>');
        } else if (temperature > 1700) {
          warningMessages.push('<div class="alert alert-danger">Advertencia: Temperatura alta (> 1700)</div>');
        }
        if (humidity < 1200) {
          warningMessages.push('<div class="alert alert-warning">Advertencia: Humedad baja (< 1200)</div>');
        } else if (humidity > 2200) {
          warningMessages.push('<div class="alert alert-warning">Advertencia: Humedad alta (> 2200)</div>');
        }
        if (battery < 50) {
          warningMessages.push('<div class="alert alert-danger">Advertencia: Batería baja (< 50V)</div>');
        }

        document.getElementById('warningMessages').innerHTML = warningMessages.join('');

        // Actualizar gráfico de temperatura
        updateTemperatureChart(data);
      }

      // Actualizar gráfico de temperatura
      function updateTemperatureChart(data) {
        const time = new Date(data.time * 1000).toLocaleTimeString();
        const temperature = parseFloat(data.data.temperature);

        if (temperatureChart) {
          temperatureChart.data.labels.push(time);
          temperatureChart.data.datasets[0].data.push(temperature);
          if (temperatureChart.data.labels.length > 10) {
            temperatureChart.data.labels.shift();
            temperatureChart.data.datasets[0].data.shift();
          }
          temperatureChart.update();
        }
      }

      // Inicializar página
      document.addEventListener('DOMContentLoaded', () => {
        initTemperatureChart();
        loadData();
        setInterval(loadData, 60000); // Actualizar cada 60 segundos
      });
    </script>
  </body>
  </html>
  `;

  res.send(html);
});

// Ruta para obtener los datos en formato JSON
app.get('/api/datos', (req, res) => {
  db.all('SELECT * FROM datos ORDER BY time DESC LIMIT 10', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al cargar datos' });

    const processedData = rows.map(row => {
      return {
        time: row.time,
        data: JSON.parse(row.data)
      };
    });

    res.json(processedData);
  });
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
