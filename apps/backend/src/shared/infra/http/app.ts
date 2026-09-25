import express from "express";
import cors from "cors";

const app = express();

app.use(express.json());
app.use(cors());

app.get("/", (_req, res) => {
  res.send("Vida plena");
});

export { app };