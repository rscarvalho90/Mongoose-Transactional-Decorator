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