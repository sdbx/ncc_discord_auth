declare module "hangul-js" {
    /**
     * 문자열 str에 있는 한글을 자음/모음으로 분리하여 문자들의 배열로 돌려줍니다.
     * 이 때 한글이 아닌 문자는 그대로 반환됩니다.
     * Hangul.d처럼 짧은 이름으로 사용할 수도 있습니다.
     * @param str 문자열
     * @param grouped  문자열의 각 글자별로 따로 분리(string[][]).
     */
    export function disassemble(str:string, grouped?:boolean):string[] | Array<string[]>;
    /**
     * 문자열 str에 있는 한글을 자음/모음으로 분리하여 문자들의 배열로 돌려줍니다.
     * 이 때 한글이 아닌 문자는 그대로 반환됩니다.
     * @param str 문자열
     * @param grouped  문자열의 각 글자별로 따로 분리(string[][]).
     */
    export function d(str:string, grouped?:boolean):string[] | Array<string[]>;
    /**
     * 한글 자음/모음들의 배열 arr을 인자로 받아 이를 조합한 문자열을 돌려줍니다.
     * 이 때 한글이 아닌 문자는 그대로 반환됩니다.
     * Hangul.a처럼 짧은 이름으로 사용할 수도 있습니다.
     * @param arr ['ㄱ','ㅏ'] 같은 것
     */
    export function assemble(arr:string[]):string;
    /**
     * 한글 자음/모음들의 배열 arr을 인자로 받아 이를 조합한 문자열을 돌려줍니다.
     * 이 때 한글이 아닌 문자는 그대로 반환됩니다.
     * @param arr ['ㄱ','ㅏ'] 같은 것
     */
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