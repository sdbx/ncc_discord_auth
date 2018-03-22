import * as XLSX from "xlsx";
import * as fs from "fs-extra";

export default class RouteConv {
    public async getXLSX(path:string,sheet:string) {
        const workbook:XLSX.WorkBook = XLSX.readFile(path);
        const sheet_name_list:string[] = workbook.SheetNames;
        sheet_name_list.forEach((y) => {
            const worksheet:XLSX.WorkSheet = workbook.Sheets[y];
            const headers:object = {};
            const data = [];
            // first: find horizonal name
            let prevRow:number = 0;
            let startRow:number = 0;
            let buffer:Array<[string,string]> = [];
            let result:Array<[string,string]> = [];
            for (const id in worksheet) {
                if (id[0] === "!") { continue; }
                const col:string = id.match(/^[a-zA-Z]+/igm)[0];
                const row:number = Number.parseInt(id.match(/[0-9]+/igm)[0]);
                const value:string|number = worksheet[id].v;
                if(prevRow !== row){
                    buffer = [];
                }
                buffer.push([col,value.toString()]);
                if(buffer.length > result.length){
                    result = buffer;
                    startRow = row;
                }
                prevRow = row;
            }
            const columns:Map<string,string> = new Map(result);
            const out:Array<Map<string,string|number>> = [];
            // second: make
            let map:Map<string,string|number> = new Map();
            prevRow = 0;
            for (const id in worksheet) {
                if (id[0] === "!") { continue; }
                const col:string = id.match(/^[a-zA-Z]+/igm)[0];
                const row:number = Number.parseInt(id.match(/[0-9]+/igm)[0]);
                const value:string|number = worksheet[id].v;

                if(row <= startRow){
                    continue;
                }
                if(prevRow != row){
                    out.push(map);
                    map = new Map();
                }
                map.set(columns.get(col),value);
                prevRow = row;
            }
            out.push(map);
            JSON.stringify(out[5]);
        });
    }
}
