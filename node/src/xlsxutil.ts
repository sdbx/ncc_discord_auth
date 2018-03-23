import * as fs from "fs-extra";
import * as XLSX from "xlsx";

export default class XlsxUtil {
    public getXLSXTable(path:string,sheet:string):object[] {
        const out:object[] = [];
        const arr_xlsx:Array<Array<[string,string | number | Date]>> = this.getXLSXTableAsArray(path,sheet);
        for (const index in arr_xlsx) {
            const obj:object = {};
            for (const [key, value] of Object.entries(arr_xlsx[index])) {
                obj[value[0]] = value[1];
            }
            out.push(obj);
        }
        return out;
    }
    public getXLSXTableAsArray(path:string,sheet:string):Array<Array<[string,string | number | Date]>> {
        const workbook:XLSX.WorkBook = XLSX.readFile(path);
        const sheet_name_list:string[] = workbook.SheetNames;
        const childs:Array<Array<[string,string | number | Date]>> = [];
        sheet_name_list.forEach((y) => {
            const worksheet:XLSX.WorkSheet = workbook.Sheets[y];
            const headers:object = {};
            const data = [];

            let col:string;
            let row:number;
            let value:any;
            // first: find horizonal name
            let prevRow:number = 0;
            let startRow:number = 0;
            let buffer:Array<[string,string]> = [];
            let result:Array<[string,string]> = [];
            for (const id in worksheet) {
                if (id[0] === "!") { continue; }
                col = id.match(/^[a-zA-Z]+/igm)[0];
                row = Number.parseInt(id.match(/[0-9]+/igm)[0]);
                value = worksheet[id].v;
                if (prevRow !== row) {
                    buffer = [];
                }
                buffer.push([col,value.toString()]);
                if (buffer.length > result.length) {
                    result = buffer;
                    startRow = row;
                }
                prevRow = row;
            }
            const columns:Map<string,string> = new Map(result);
            // second: make
            let map:Array<[string,string | number | Date]> = [];
            prevRow = 0;
            for (const id in worksheet) {
                if (id[0] === "!") { continue; }
                col = id.match(/^[a-zA-Z]+/igm)[0];
                row = Number.parseInt(id.match(/[0-9]+/igm)[0]);
                value = worksheet[id].v;
                const type:string = worksheet[id].t; // N,S

                if (row <= startRow) {
                    continue;
                } else {
                    row -= startRow;
                }
                if (prevRow !== row && map.length > 0) {
                    childs[row] = map;
                }
                if (prevRow !== row || map.length === 0) {
                    map = [];
                    columns.forEach((v,key) => {
                        map.push([v,null] as [string,string | number | Date]);
                    });
                }
                /*
                if (typeof value === "number" && worksheet[id]) {

                }*/
                let out:string | number | Date;
                if (type === "n") {
                    if ((worksheet[id].w as string).match(/\d{1,2}\/\d{1,2}\/\d{1,4}/igm) != null) {
                        // 1990-01-01 ~ 1970-01-01 : 25,567 days , 2 day offset?
                        const oneday:number = 1000 * 3600 * 24;
                        out = new Date((value as number - 25567 - 2) * oneday);
                    } else {
                        out = value as number;
                    }
                } else {
                    out = value as string;
                }
                map = map.map((v,index) => {
                    return (v[0] === columns.get(col)) ? [v[0],out] as [string,string | number | Date] : v;
                });
                // map[columns.get(col)] = value;
                prevRow = row;
            }
            childs[row] = map;
        });
        return childs;
    }
}
