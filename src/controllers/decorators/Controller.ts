import 'reflect-metadata';
import {AppRouter} from '../../AppRouter';
import {Methods} from './Methods';
import {MetadataKeys} from './MetadataKeys';


export function Controller(routePrefix: string): ClassDecorator {
    routePrefix = `${routePrefix}`;

    return (target: Function) => {
        const router = AppRouter.getInstance();

        // Register each method as a route
        Object.getOwnPropertyNames(target.prototype).forEach((key) => {
            const routeHandler = target.prototype[key];
            const path = Reflect.getMetadata(
                MetadataKeys.path,
                target.prototype,
                key
            );
            const method: Methods = Reflect.getMetadata(
                MetadataKeys.method,
                target.prototype,
                key
            );
            const middlewares =
                Reflect.getMetadata(MetadataKeys.middleware, target, key) || [];

            if (path) {
                router[method](`${routePrefix}${path}`, ...middlewares, routeHandler);
                console.log(`Route registered ${method.toUpperCase()} - ${routePrefix}${path}`);
            }
        });
    };
}