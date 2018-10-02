import * as XLSX from "xlsx"

/* tslint:disable */
/**
 * From gongik-util
 * 
 * As Testing only.
 */
export default class XlsxUtil {
    public static getXLSXTable(path:string,sheet:string = null):object[] {
        const out:object[] = [];
        const arr_xlsx:Array<Array<[string,string | number | Date]>> = this.getXLSXTableAsArray(path,sheet);
        for (const row of arr_xlsx) {
            const obj:object = {};
            if (row != null) {
                for (const value of Object.values(row)) {
                    obj[value[0]] = value[1];
                }
                out.push(obj);
            }
        }
        return out;
    }
    public static getAlphabet(value:number):string {
        if (value <= 0) {
            throw new Error("No value <= 0");
        }
        const length:number = Math.floor(Math.log(value) / Math.log(26)) + 1;
        let out:string = "";
        for (let i = 0;i < length;i += 1) {
            const offset:number = 64 + Math.floor((value % Math.pow(26,i + 1)) / Math.pow(26,i));
            out = String.fromCharCode(offset) + out;
        }
        return out;
    }
    public static getNumber(alphabet:string):number {
        let out:number = 0;
        for (let i:number = alphabet.length - 1;i >= 0;i -= 1) {
            // A:65
            out += (alphabet.charCodeAt(i) - 64) * Math.pow(26,i);
        }
        out = Math.max(out,1);
        return out;
    }
    public static getXLSXTableAsArray(path:string,sheet:string):Array<Array<[string,string | number | Date]>> {
        const workbook:XLSX.WorkBook = XLSX.readFile(path);
        const sheet_name_list:string[] = workbook.SheetNames;
        const childs:Array<Array<[string,string | number | Date]>> = [];

        sheet_name_list.forEach((y) => {
            const worksheet:XLSX.WorkSheet = workbook.Sheets[y];
            const headers:object = {};
            const data = [];

            if (sheet !== null && y !== sheet) {
                return;
            }
            let col:string;
            let row:number;
            let value:any;
            // zero: get max length
            let _prevCol:number = 0;
            for (const id in worksheet) {
                if (id[0] === "!") { continue; }
                const colnum:number = this.getNumber(id.match(/^[a-zA-Z]+/igm)[0]);
                if (colnum > _prevCol) {
                    _prevCol = colnum;
                }
            }
            const maxLength:number = _prevCol;
            // first: find horizonal name
            let prevRow:number = 0;
            let startRow:number = 0;
            let forceRow:number = -1;
            let buffer:Array<[string,string]> = [];
            let result:Array<[string,string]> = [];
            // console.log(JSON.stringify(worksheet["!merges"]));
            for (const id in worksheet) {
                if (id[0] === "!") { continue; }
                col = id.match(/^[a-zA-Z]+/igm)[0];
                /*
                let colnum = 0;
                for (let i = col.length - 1;i >= 0;i -= 1) {
                    // A:65
                    colnum += (col.charCodeAt(i) - 64) * Math.pow(26,i);
                }
                colnum = Math.max(colnum - 1,0);
                */
                const colnum:number = this.getNumber(col) - 1;
                row = Number.parseInt(id.match(/[0-9]+/igm)[0]) - 1;
                value = worksheet[id].v;
                // console.log(id + " / " + col + " / " + row + " / " + colnum);
                // check merge
                let rect:XLSX.Range = null;
                const rowOverrides:string[] = [];
                // reset
                if (prevRow !== row && forceRow !== row) {
                    // reset only not force
                    buffer = [];
                    forceRow = -1;
                }
                if (this.isIterable(worksheet["!merges"])) {
                    for (const block of worksheet["!merges"]) {
                        if (colnum >= block.s.c && colnum <= block.e.c && row >= block.s.r && row <= block.e.r) {
                            // It's merge cell..
                            if (Math.abs(block.e.r - block.s.r) > 0) {
                                // Override buffer - vertical
                                forceRow = Math.max(block.e.r,forceRow);
                                rowOverrides.push(col);
                            }
                            if (Math.abs(block.e.c - block.s.c) > 0) {
                                // Override data - horizonal
                                for (let i = block.s.c;i <= block.e.c;i += 1) {
                                    rowOverrides.push(this.getAlphabet(i + 1));
                                }
                            }
                            rect = block;
                        }
                    }
                }
                // splice duplicate
                let modified:boolean = false;
                // tslint:disable-next-line
                for (let k = 0;k < buffer.length;k += 1) {
                    const key = buffer[k][0];
                    const v = buffer[k][1];
                    if (col === key) {
                        // exists
                        if (rect === null) {
                            // Not merge -> force override... or chain.
                            buffer[k][1] += this.seperator + value.toString();
                        } else {
                            // Merged -> does not override
                        }
                        modified = true;
                    }
                    if (rect !== null) {
                        for (let i:number = 0;i < rowOverrides.length;i += 1) {
                            if (key === rowOverrides[i]) {
                                // console.log("remove: " + key);
                                rowOverrides.splice(i,1);
                                break;
                            }
                        }
                    }
                }
                // console.log((modified) + " / " + (rect == null));
                if (rect === null) {
                    if (!modified) {
                        // not exists
                        buffer.push([col,value.toString()]);
                    }
                } else {
                    for (const key of rowOverrides) {
                        buffer.push([key,value.toString()]);
                    }
                }
                // buffer.push([col,value.toString()]);
                const dup:boolean = buffer.map((_value) => {
                    return _value[1];
                }).filter((_value, _index, _self) => {
                    return _self.indexOf(_value) === _index;
                }).length !== buffer.length;
                // console.log(`${!dup} / ${forceRow} / ${row}`);
                if (!dup && buffer.length > result.length && (forceRow < 0 || forceRow === row)) {
                    result = buffer;
                    startRow = row + 1;
                }
                if (result.length === maxLength && row >= startRow) {
                    break;
                }
                // console.log("startrow: " + startRow);
                prevRow = row;
            }
            /*
                Test
            */
            const columns:Map<string,string> = new Map(result);
            const echo:string[] = [];
            for (const [k,v] of columns.entries()) {
                echo.push(v);
            }
            if (echo.length >= 1) {
                // console.log(`Header: ${echo.join(",")}`);
            }
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
                // console.log("############### " + row + " / " + JSON.stringify(map));
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
            // console.log("############### " + row + " / " + JSON.stringify(map));
            childs[row + 1] = map;
        });
        return childs;
    }
    public static isIterable(obj:any):boolean {
        // checks for null and undefined
        if (obj == null) {
          return false;
        }
        return typeof obj[Symbol.iterator] === "function";
    }
    /**
     * Get value of object matching regex and key
     * @param data object to find
     * @param key_regex Regex[es]
     */
    public static getByRegex(data:object,...key_regex:RegExp[]):any {
        const entries:Array<[string,any]> = Object.entries(data);
        for (const [key,value] of entries) {
            for (const regex of key_regex) {
                if (key.match(regex)) {
                    return value;
                }
            }
        }
        return null;
    }
    /**
     * @static ends
     */
    private static readonly seperator:string = "_";
    /* object */
    public sheets:Array<[string,object[]]>;
    public workbook:XLSX.WorkBook;
    public wb_sheets:string[];
    public constructor() {
        this.sheets = [];
        this.wb_sheets = [];
        this.workbook = null;
    }
    public loadPreset(filename:string):XlsxUtil {
        const workbook:XLSX.WorkBook = XLSX.readFile(filename);
        const sheet_name_list:string[] = workbook.SheetNames;
        const childs:Array<Array<[string,string | number | Date]>> = [];
        sheet_name_list.forEach((y) => {
            const sheets:XLSX.Sheet = workbook.Sheets[y];
            this.wb_sheets.push(y);
        });
        this.workbook = workbook;
        return this;
    }
    public clear(sheetname:string = "main"):void {
        this.sheets.forEach((v:[string,object[]],index) => {
            const [name,value] = v;
            if (name === sheetname) {
                this.sheets.splice(index,1);
            }
        });
    }
    public addCells(data:object[], sheetname:string = "main"):XlsxUtil {
        let finished:boolean = false;
        let i:number = 0;
        for (const [name,value] of this.sheets) {
            if (name === sheetname) {
                for (const column of data) {
                    this.sheets[i][1].push(column);
                }
                finished = true;
                break;
            }
            i += 1;
        }
        if (!finished) {
            const out:object[] = [];
            for (const column of data) {
                out.push(column);
            }
            this.sheets.push([sheetname,out]);
        }
        return this;
    }
    public exportXLSX(filename:string,data:object[] = null,xlsxname:string = "Main"):boolean {
        let sheets:Array<[string,object[]]> = this.sheets;
        if (data != null) {
            sheets = [["Main",data]];
        }
        let first:boolean = true;
        let _workbook:XLSX.WorkBook;
        if (this.workbook != null) {
            _workbook = this.workbook;
            for (const [name, sheet] of Object.entries(_workbook.Sheets)) {
                for (const [workname,value] of sheets) {
                    if (name === workname || first) {
                        first = false;
                        XLSX.utils.sheet_add_json(sheet,value);
                        break;
                    }
                }
            }
        } else {
            _workbook = { SheetNames: [], Sheets: {} };
            for (const [workname,value] of sheets) {
                XLSX.utils.book_append_sheet(_workbook, XLSX.utils.json_to_sheet(value),workname);
            }
        }
        try {
            XLSX.writeFile(_workbook,filename);
        } catch (err) {
            console.log(err);
            return false;
        }
        return true;
    }
}
