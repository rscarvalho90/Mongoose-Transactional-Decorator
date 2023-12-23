import mongoose from "mongoose";

const dbConnString = "mongodb://127.0.0.1:27017/YOUR-COLLECTION-NAME"

export const db = mongoose.connect(dbConnString, {replicaSet: "YOUR-REPLICA-SET-NAME"});