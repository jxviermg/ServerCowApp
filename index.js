const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));

// Aquí se guardarán los datos temporalmente (en memoria)
let datosRecibidos = [];

app.post("/callback", (req, res) => {
  const data = {
    id: req.query.id,
    time: req.query.time,
    key1: req.query.key1,
    key2: req.query.key2,
    body: req.body,
  };
  datosRecibidos.push(data);
  console.log("Datos recibidos:", data);
  res.status(200).send("OK");
});

// Endpoint para obtener los datos
app.get("/datos", (req, res) => {
  res.json(datosRecibidos);
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});

