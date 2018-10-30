declare module "bencodex" {
    /**
     * Encode Data to Bencodex
     * @param data Any.
     * 
     * @returns Buffer
     */
    export function encode(data:any):Buffer;
    export function decode(data:Buffer):unknown;
}