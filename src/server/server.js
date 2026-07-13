require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());


const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: true
    }
});


app.get("/", (req,res)=>{
    res.send("Budget API running");
});


app.get("/test-db", async(req,res)=>{

    try {

        const [rows] = await db.query(
            "SELECT NOW() AS time"
        );

        res.json(rows);

    } catch(error){

        console.log(error);
        res.status(500).json(error);

    }

});


app.listen(3000, ()=>{
    console.log("Server running on port 3000");
});