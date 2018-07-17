declare module "hangul-js" {
    export function disassemble(str:string, grouped?:boolean):string[] | Array<string[]>;
    export function d(str:string, grouped?:boolean):string[] | Array<string[]>;
    export function assemble(arr:string[]):string;
    export function a(arr:string[]):string;
    export function search(a:string, b:string):number;
    export class Searcher {
        constructor(str:string);
        search(query:string):number;
    }
    export function rangeSearch(a:string, b:string):Array<[number,number]>;
    export function isComplete(c:string):boolean;
    export function isCompleteAll(str:string):boolean;
    export function isConsonant(c:string):boolean;
    export function isCosonantAll(str:string):boolean;
    export function isVowel(c:string):boolean;
    export function isVowelAll(str:string):boolean;
    export function isCho(c:string):boolean;
    export function isChoAll(str:string):boolean;
    export function isJong(c:string):boolean;
    export function isJongAll(str:string):boolean;
    export function endsWithConsonant(c:string):boolean;
}