import {Request, Response} from "express";
import {Controller, Post} from "./decorators";
import {MongooseTransactional} from "./decorators/mongoose/MongooseTransactional";
import {Account} from "../model/schemas/Account";
import {ClientSession} from "mongoose";

@Controller("/account")
export class AccountController {

    /**
     * Transfer funds from this account to another one.
     *
     * @param req - HTTP Request (injected)
     * @param res - HTTP Response (injected)
     * @param session - Mongoose ClientSession (injected)
     */
    @Post("/transactional_transfer")
    @MongooseTransactional()
    async transactionalTransferFundsTo(req: Request, res: Response, session: ClientSession): Promise<void> {
        await transferFunds(req, res, session);
    }

    @Post("/not_transactional_transfer")
    async notTransactionalTransferFundsTo(req: Request, res: Response): Promise<void> {
        await transferFunds(req, res);
    }
}

async function transferFunds(req: Request, res: Response, session?: ClientSession) {
    // Business Rules
    let originAccount;

    if(session)
        originAccount = await Account.find({"account_number": req.body.origin_account_number}).session(session);
    else
        originAccount = await Account.find({"account_number": req.body.origin_account_number});

    if (originAccount.length === 1) { // Account found
        if (!originAccount[0].is_blocked) {
            // Origin account has enough balance
            if (originAccount[0].account_balance > req.body.amount) {
                // Update the origin account balance before transfer to the destination account
                originAccount[0].account_balance = originAccount[0].account_balance - req.body.amount;

                /* As originAccount[0] was found with a session (in transactional decorated methods), save will
                        use the associated session */
                await originAccount[0].save();

                let destAccount;

                if(session)
                    destAccount = await Account.find({"account_number": req.body.destination_account_number}).session(session);
                else
                    destAccount = await Account.find({"account_number": req.body.destination_account_number});

                if (destAccount.length === 1) {
                    if (!destAccount[0].is_blocked) {
                        destAccount[0].account_balance = destAccount[0].account_balance + req.body.amount;

                        /* As destAccount[0] was found with a session (in transactional decorated methods), save will
                        use the associated session */
                        await destAccount[0].save();

                        res.status(200).send("Transfer realized!");
                        return;
                    } else {
                        res.status(400).send("Destination account is blocked!");
                        throw new Error("Destination account is blocked!");
                    }
                } else if (destAccount.length === 0) { // Destination account not found
                    res.status(404).send("Destination account not found!");
                    return;
                } else { // More than one destination account found
                    res.status(500).send("Internal error!");
                    return;
                }
            } else {
                res.status(400).send("Not enough origin account balance!");
                return;
            }
        } else { // Origin account is blocked
            res.status(400).send("Origin account is blocked!");
            return;
        }
    } else if (originAccount.length === 0) { // Origin account not found
        res.status(404).send("Origin account not found!");
        return;
    } else { // More than one origin account found
        res.status(500).send("Internal error!");
        return;
    }
}