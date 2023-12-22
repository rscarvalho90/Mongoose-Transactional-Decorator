# Transactional Mongoose controllers in TypeScript + Express.js + MongoDB using decorators

As a Java developer working on **TypeScript + Express.js** projects, I ever miss the Spring annotations used in Spring
Controllers. *Transactional* and *RequestMapping* used to be my favorites. Each Java controller I code use to have at
least one of them. So, when I had to work with Express.js and TypeScript, it became a big issue for me, mainly in
complexes controllers which the focus is on the business rules and open the possibility of forgetting the
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
configurated as this way, you can copy the content of the [decorators folder]() on this project repository on GitHub or
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

In addition, you must have installed *express*, *reflect-metadata* and *mongoose*. Take a look at the [package.json]()
of my example project to view the libraries' versions I've used. <br>
Don't forget to enable the *experimentalDecorators*, *emitDecoratorMetadata* and *sourceMap*, marking them as **true**
on **tsconfig.json**. The first will enable the use of decorators (essential for this tutorial), the second will enable
the use of the *reflect-metadata* when decorators are created and the third will allow you debug the TypeScript code
while Express.js is running (it creates a map pointing the JavaScript compiled code to the TypeScript code).

## 3) Creating the Transactional decorator

In this tutorial we will use Mongoose as our ODM (Object Document Mappers) that will be responsible to manage the
transactions. Other packages can be used applying some adaptations.<br>
At this point, I will suppose you have knowledge about the use of Mongoose ODM, but, any doubts about its configuration
you can consult the [repository]() on GitHub.<br>
Now, returning to our subject, the Transactional decorator must:

1. Start a session
2. Open a transaction
3. Commit or abort the transaction <br>
   3.1. Commit the transaction if everything went well <br>
   3.2. Abort the transaction if some error has been thrown
4. Close the session

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
            } finally {
                // This block will be executed only if the method is synchronous
                if (!isAsyncMethod) {
                    // Close the session (Step 4)
                    await session.endSession();
                    console.log("[Sync] Session finished.");
                    args[1].status(500).send("An error occurred!")
                }
            }
        }

        return descriptor;
    }
}
```