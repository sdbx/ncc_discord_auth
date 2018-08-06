declare module "terminal-image" {
    /**
     * Display image from image buffer
     * @param imageBuffer Image Buffer
     * @returns ANSI-escaped string
     */
    export function buffer(imageBuffer:Buffer):Promise<string>;
    /**
     * Display image from file path
     * @param filePath File path
     * @returns ANSI-escaped string
     */
    export function file(filePath:string):Promise<string>;
}