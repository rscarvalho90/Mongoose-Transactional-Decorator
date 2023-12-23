# Transactional Mongoose controllers in TypeScript + Express.js + MongoDB using decorators

As a Java developer working on **TypeScript + Express.js** projects, I ever miss the Spring annotations used in Spring
Controllers. *Transactional* and *RequestMapping* used to be my favorites. Each Java controller I code use to have at
least one of them. So, when I had to work with Express.js and TypeScript, it became a big issue for me, mainly in
complex controllers which the focus is on the business rules and open the possibility of forgetting the
database connection cycle management.

Transactions are a professional way to manage database operations during some code execution, especially in the complex
ones. For example, imagine you're developing a software for a bank which you have to transfer money between two
accounts. Then you draw the money from Account "A" and deposit it in the Account "B". It appears simple, but imagine
that the account B is blocked for some reason, so you have to manually redeposit the money for the Account "A".
Looking this action in the database side you would have (if the database was a SQL one) to do an UPDATE operation on
Account "A", removing the amount of money, verify the Account "B" with a SELECT state and assure that the account is not
blocked and, verifying that it is blocked, do another UPDATE in Account "A" and give back the money. If you use
Transactions, you just have to throw an error when you verify that the account is block and the transaction
automatically will undo transparently the database operations (create, update or delete) you have performed until that.

**P.S.** It was just a simple example. Banking operations are more complex than this, involving verifying bank balance,
registering transactions history etc.

So, in this tutorial you will learn how to create a custom *decorator* (that is a "second cousin" of Java annotations)
that will provide a transaction management, allowing you to spend your time in what really imports: a quality and
functional software that attends its purposes. <br>

## 1) Configuring MongoDB

By default, MongoDB is configured in standalone mode, which not allows the use of transactions. To unlock this feature,
**you need to configure the server as a *replica set***. In my example, I will show how to configure the server as a *
*one node replica set*.<br>
The easiest way to configure the server as a replica set is creating a new *mongod.cfg* file. The file bellow is the
simplest one that will allow you to create the one node replica set we will need. Don't forget to change the values of
the fields *dbPath*, *path* and *replSetName* fields, the first two can vary depending on OS and the directory where
MongoDB is installed.

```` mongod.conf for replica set use
# mongod.conf

# for documentation of all options, see:
# http://docs.mongodb.org/manual/reference/configuration-options/

# Where and how to store data.
storage:
  dbPath: "YOUR-DATA-FOLDER-PATH"

# Where to write logging data.
systemLog:
  destination: file
  logAppend: true
  path:  "YOUR-LOG-PATH"

# network interfaces
net:
  port: 27017
  bindIp: 127.0.0.1

#processManagement:

#security:

#operationProfiling:

replication:
  replSetName: "YOUR-REPLICA-SET-NAME"

#sharding:

## Enterprise-Only Options:

#auditLog:
````

The only difference between it and the default one is the replication parameter:

```
replication:
  replSetName: "YOUR-REPLICA-SET-NAME"
```

After create your custom MongoDB config file, you must configure MongoDB to use it. The easiest way to do this is to
rename the custom file with the default name (mongod.conf) and restart MongoDB (choose the correct way for your
operating system). Another way is stopping MongoDB and running it pointing the custom file:

````
mongod --config "PATH/TO/custom_mongod_replicaset.cfg
````

Now your MongoDB is running using a replica set containing just one node (and it is enough for this tutorial).

## 2) Our environment (decorated Express.js routes)

Our environment is configured to use decorated Express.js routes, a different way in each route is a method of a
class (known as Controller). Teach this is not the objective of this tutorial but, if you don't have your code
configurated as this way, you can copy the content of
the [decorators folder](https://github.com/rscarvalho90/Mongoose-Transactional-Decorator/tree/master/src/controllers/decorators)
on this project repository on GitHub or
follow
this [tutorial](https://medium.com/globant/expressjs-routing-with-decorators-dependency-injection-and-reflect-metadata-945f92e15a06).

In resume, you must have your controller looking like this:

```
import {Request, Response} from "express";
import {Controller, Post} from "./decorators";

@Controller("/account")
export class AccountController {

    /**
     * Transfer funds from this account to another.
     *
     * @param req - HTTP Request (injected)
     * @param res - HTTP Response (injected)
     */
    @Post("/transfer")
    transferFundsTo(req: Request, res: Response): void {
        // Controller operations

        const ourResponse = "Ammount tranfered!"

        res.status(200).send(ourResponse);
    }
}
```

In addition, you must have installed *express*, *reflect-metadata* and *mongoose*. Take a look at
the [package.json](https://github.com/rscarvalho90/Mongoose-Transactional-Decorator/blob/master/package.json)
of my example project to view the libraries' versions I've used. <br>
Don't forget to enable the *experimentalDecorators*, *emitDecoratorMetadata* and *sourceMap*, marking them as **true**
on **tsconfig.json**. The first will enable the use of decorators (essential for this tutorial), the second will enable
the use of the *reflect-metadata* when decorators are created and the third will allow you debug the TypeScript code
while Express.js is running (it creates a map pointing the JavaScript compiled code to the TypeScript code).

## 3) Creating the Transactional decorator

In this tutorial we will use Mongoose as our ODM (Object Document Mappers) that will be responsible to manage the
transactions. Other packages can be used applying some adaptations.<br>
At this point, I will suppose you have knowledge about the use of Mongoose ODM, but, any doubts about its configuration
you can consult the [repository](https://github.com/rscarvalho90/Mongoose-Transactional-Decorator/) on GitHub.<br>
Now, returning to our subject, the Transactional decorator must:

1. Start a session;
2. Open a transaction;
3. Commit or abort the transaction; <br>
   3.1. Commit the transaction if everything went well; <br>
   3.2. Abort the transaction if some error has been thrown;
4. Close the session.

So, we can write the Transactional decorator in this way:

```
import {db} from "../../../dbConfig";

/**
 * Decorator that creates a transactional method for a Mongoose model.
 */
export function MongooseTransactional(): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        // Get the original method from the descriptor
        let originalDescriptor = descriptor.value;

        // Change the decorated method content
        descriptor.value = async (...args: any[]) => {
            // Inject a Mongoose session as the third parameter of the decorated method (Step 1)
            const session = await (await db).startSession();
            args[2] = session;
            let isAsyncMethod = false;

            try {
                // Start the transaction (Step 2)
                session.startTransaction();

                /* Run the method. If the original is a sync method, it will return the result, otherwise return a
                 Promise */
                const originalDescriptorReturn = originalDescriptor.apply(target, args);

                // Case the original method is async
                if (originalDescriptorReturn && originalDescriptorReturn instanceof Promise) {
                    isAsyncMethod = true;
                    try {
                        const result = await originalDescriptorReturn;

                        // Commit the transaction (Step 3.1)
                        await session.commitTransaction();
                        console.log("Transaction committed");

                        return result;
                    } catch (error: any) {
                        console.error(`[Async] An error occurred while executing ${propertyKey as string}.`);
                        console.error(error.stack);
                        // Abort the transaction (Step 3.2)
                        await session.abortTransaction();
                        console.log("Transaction aborted");

                        // Send a response with error if another one have not been sent
                        if(!args[1].writableFinished) {
                            args[1].status(500).send("An error occurred!")
                        }
                    } finally {
                        // Close the session (Step 4)
                        await session.endSession();
                        console.log("[Async] Session finished.");
                    }
                }
            } catch (error: any) { // Catch error case sync method
                isAsyncMethod = false;
                console.error(`[Sync] An error occurred while executing ${propertyKey as string}.`);
                console.error(error.stack);
                // Abort the transaction (Step 3.2)
                await session.abortTransaction();
                console.log("Transaction aborted");

                // Send a response with error if another one have not been sent
                if(!args[1].writableFinished) {
                    args[1].status(500).send("An error occurred!")
                }
            } finally {
                // This block will be executed only if the method is synchronous
                if (!isAsyncMethod) {
                    // Close the session (Step 4)
                    await session.endSession();
                    console.log("[Sync] Session finished.");
                }
            }
        }

        return descriptor;
    }
}
```

The most important part of this decorator is the *session* injection as the third parameter of the decorated method. It
will allow Mongoose operations (like *save*, *update*, *create* etc.) that receive a *session* as parameter to be able
to receive the *session* created inside the **MongooseTransactional** decorator.

The second most import part is to identify what kind of method we are decorating. When we use TypeScript decorators, we
have to be careful to handle sync and async methods. As async method always will return a response (a Promise)
independently if the code has throw an error or not, we have to identify what kind of method we are decorating before
apply the correct treatment. In the example above, second *finally* block has analyzed if the method is synchronous or
not before finish the session. Case it was not done, in asynchronous methods, the session could be finished before it
treatment in the respective part of the decorator.

The third and last important part is to identify if another response has been sent before the response coming from the
MongooseTransactional decorator. Here I used the *writableFinished* method to verify if the response could be written
or not. It's prudent use this solution when you decorate methods with many decorators (in my
[project](https://github.com/rscarvalho90/Mongoose-Transactional-Decorator/) the
[**MongooseTransactional**](https://github.com/rscarvalho90/Mongoose-Transactional-Decorator/blob/master/src/controllers/decorators/mongoose/MongooseTransactional.ts)
and [**Routes**](https://github.com/rscarvalho90/Mongoose-Transactional-Decorator/blob/master/src/controllers/decorators/Routes.ts)
can be an example of this) and one of then responds the request
before another, avoiding an application crash.

## 4) Applying the Transactional decorator

### 4.1) Decorating the route method

Returning to our bank application example, lets apply the decorator to a controller. To do this, you must:

1) Add the **@MongooseTransactional** annotation before the route;
2) Add the **ClientSession** that will be injected by the decorator;
3) Convert the method to asynchronous one, as it will be converted inside the decorator.

Our route method, before executing Mongoose operations, will be like this below:

```
import {Request, Response} from "express";
import {Controller, Post} from "./decorators";
import {ClientSession} from "mongoose";

@Controller("/account")
export class AccountController {

    /**
     * Transfer funds from this account to another.
     *
     * @param req - HTTP Request (injected by Express.js)
     * @param res - HTTP Response (injected by Express.js)
     * @param session - Mongoose ClientSession (injected by MongooseTransactional decorator)
     */
    @Post("/transfer")
    @MongooseTransactional
    async transferFundsTo(req: Request, res: Response, session: ClientSession): void {
        // Controller operations

        const ourResponse = "Ammount tranfered!"

        res.status(200).send(ourResponse);
    }
}
```

### 4.2) Using the injected *session* in Mongoose operations

After decorate the method, we have to use the injected *session* inside Mongoose operations like *save*, *update*,
*create* etc. To do this, just inform the *session* as parameter of the operations methods, like this, where ModelName
can be any model for your document collection:

```
await ModelName.create([
         {
            "model_attribute_name1": model_attribute1_value, 
            "model_attribute_name2": model_attribute2_value
         }
      ], {session});
```

Don't forget, when you use the *session* as parameter, to put the document object inside brackets. Otherwise, the
transactional operation may not work.
In update and delete operations, if you get the object using *find* methods with *session* informed, you don't have
to use the *session* after, in the moment of effectively run the transactional operation:

```
entity = await ModelName.find(["model_attribute_name1": model_attribute1_value]).session(session);
entity.model_attribute_name2 = "newAttribute2Value";
await entity.save();
```

Using the bank operation as example, our route method will be written as below:

```
 /**
  * Transfer funds from this account to another one.
  *
  * @param req - HTTP Request (injected by Express.js)
  * @param res - HTTP Response (injected by Express.js)
  * @param session - Mongoose ClientSession (injected by MongooseTransactional decorator)
  */
 @Post("/transfer")
 @MongooseTransactional()
 async transferFundsTo(req: Request, res: Response, session: ClientSession): Promise<void> {
     // Business Rules
    let originAccount;

    if (session)
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

                if (session)
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
```

In the example above, an error was thrown after a blocked destination account was found, but is more common errors
be found inside method execution, like malformed integrations.

## 5) Testing the decorator functionality

In the
[Test File](https://github.com/rscarvalho90/Mongoose-Transactional-Decorator/blob/master/tests/MoongoseTransactional.test.ts)
we can analyze the method behavior of the decorated and non-decorated route method.

In the "Transfer with destination account blocked [with transaction abort (roll back database)" test, $100 was drawn
from origin account and, when the error has occurred, the transaction rolled back to the initial state, returning the
origin account balance to the initial state ($1000).

In the "Transfer with destination account blocked [without transaction abort (not roll back database)]" test, we can
see a bad code piece, where an error was thrown, but the absence of transaction cause a database failure, removing
$100 of the origin account and not returning the original account balance not even transfer it to destination account.
It could be a serious problem for a financial institution, even causing intervention of regulation organisms.

In the "Transfer with destination account not blocked", the account's balances was rolled back to the initial state
($1000) and the destination account was unblocked. Now the transfer occurred perfectly, removing $100 from origin
account and deposited on the destination account.

```
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
```

## 6) Conclusion

Using this decorator can turn the developer work easier when using database operations. This decorator can be
resumed as a way to surround a route method with a try/catch block and treat the exceptions using transaction management
(committing or aborting it and closing the session). It is not easier than the Spring @Transactional decorator in Java,
but, considering the maturity of TypeScript, it is a great advance for Node.js when programming NoSQL database operations.
