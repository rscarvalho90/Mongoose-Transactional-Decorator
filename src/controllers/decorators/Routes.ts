import 'reflect-metadata';
import {Methods} from './Methods';
import {MetadataKeys} from './MetadataKeys';


function Route(method: string){
    return function (path: string): MethodDecorator {
        return function (target: any, propertyKey: string|symbol, descriptor: PropertyDescriptor) {
            Reflect.defineMetadata(MetadataKeys.path, path, target, propertyKey);
            Reflect.defineMetadata(MetadataKeys.method, method, target, propertyKey);

            const originalDescriptor = descriptor.value;

            // Handle exceptions in annotated routes
            descriptor.value = function (...args: any[]) {
                try {
                    const originalDescriptorResult = originalDescriptor.apply(this, args); // Run the original method

                    // Async method
                    if (originalDescriptorResult && originalDescriptorResult instanceof Promise) {
                        // Return promise
                        return originalDescriptorResult.then((result: any) => {
                             return result;
                        }).catch((err: any) => {
                            console.error(`[Async] An error occurred while executing ${propertyKey as string}.`);
                            console.error(err.stack);

                            if(!args[1].writableFinished) { // Verify if other decorator has responded the client
                                // args[1] is the Response on the routed function
                                args[1].status(500).send("An unexpected error occurred while executing the request");
                            }
                        });
                    }

                    return originalDescriptorResult;
                } catch (err: any) {
                    console.error(`An error occurred while executing ${propertyKey as string}.`);
                    console.error(err.stack);

                    if(!args[1].writableFinished) { // Verify if other decorator has responded the client
                        // args[1] is the Response on the routed function
                        args[1].status(500).send("An unexpected error occurred while executing the request");
                    }
                }
            }

            return descriptor;
        };
    };
}

export const Get = Route(Methods.get);
export const Put = Route(Methods.put);
export const Post = Route(Methods.post);
export const Del = Route(Methods.del);
export const Patch = Route(Methods.patch);
