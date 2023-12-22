import axios from "axios";
import mongoose, {Schema} from "mongoose";
import {db} from "../src/dbConfig";
import {Account} from "../src/model/schemas/Account";


async function createInitialAccountState() {
    await db;

    await new Account({
        account_number: 54545488,
        account_balance: 1000,
        is_blocked: false
    }).save();

    await new Account({
        account_number: 2845645,
        account_balance: 1000,
        is_blocked: true
    }).save();
}

async function cleanAccounts() {
    await Account.collection.drop();
}

describe("Mongoose Transactional", () => {
    test("Create initial state", async () => {
        await cleanAccounts();
        await createInitialAccountState();
    })

    test("Transfer with destination account blocked [with transaction abort (roll back database)]", async () => {
        const response = await axios.post("http://localhost:8080/account/transactional_transfer", {
            "origin_account_number": 54545488,
            "destination_account_number": 2845645,
            "amount": 100
        }).catch(err => err);

        expect(response.response.data).toEqual("Destination account is blocked!");

        const originAccount = await Account.find({account_number: 54545488});
        const destinationAccount = await Account.find({account_number: 2845645});

        expect(originAccount[0].account_balance).toEqual(1000);
        expect(destinationAccount[0].account_balance).toEqual(1000);
    });

    test("Transfer with destination account blocked [without transaction abort (not roll back database)]", async () => {
        const response = await axios.post("http://localhost:8080/account/not_transactional_transfer", {
            "origin_account_number": 54545488,
            "destination_account_number": 2845645,
            "amount": 100
        }).catch(err => err);

        expect(response.response.data).toEqual("Destination account is blocked!");

        const originAccount = await Account.find({account_number: 54545488});
        const destinationAccount = await Account.find({account_number: 2845645});

        expect(originAccount[0].account_balance).toEqual(900);
        expect(destinationAccount[0].account_balance).toEqual(1000);
    });

    test("Transfer with destination account not blocked", async () => {
        await Account.updateOne({account_number: 2845645}, {account_balance: 1000, is_blocked: false});
        await Account.updateOne({account_number: 54545488}, {account_balance: 1000});

        const response = await axios.post("http://localhost:8080/account/transactional_transfer", {
            "origin_account_number": 54545488,
            "destination_account_number": 2845645,
            "amount": 100
        }).catch(err => err);

        expect(response.data).toEqual("Transfer realized!");

        const originAccount = await Account.find({account_number: 54545488});
        const destinationAccount = await Account.find({account_number: 2845645});

        expect(originAccount[0].account_balance).toEqual(900);
        expect(destinationAccount[0].account_balance).toEqual(1100);

        await cleanAccounts();
    });
})

