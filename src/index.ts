import express from "express";
import {AppRouter} from "./AppRouter";
import './controllers/';
import {db} from "./dbConfig";

export const port = 8080;
const app = express();

export const router = AppRouter.getInstance();

const errorHandler = (err: any, req: any, res: any, next: any) => {
    console.error(err.stack);
    res.status(500).send("An unexpected error occurred while executing the request");
}

app.use(express.static('res'));
app.use(express.json()); // to support JSON-encoded bodies
app.use(express.urlencoded({extended: true})); // to support URL encoded bodies
app.use(router);
app.use(errorHandler);

db.then(() => {
    console.log("Database connected!");
    app.listen(port, () => {
        console.log(`Listening on port ${port}`);
    });
})