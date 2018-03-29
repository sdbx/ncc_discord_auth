import * as fs from "fs";
import * as fetcher from "./fetcher";
import Config from "./structure/config";
import XlsxUtil from "./xlsxutil";

const conv:XlsxUtil = new XlsxUtil();
// const value:any = conv.getXLSXTable("C:/Users/user/Documents/FTP/Scanned/암호화해제/test.xlsx","asdf");
const toFile:XlsxUtil = new XlsxUtil();
// toFile.loadPreset("C:/Users/user/Documents/FTP/Scanned/export__/etc/목록_proto3.xlsx");
/**
 * input : The directory of xlsx "decrypted"
 * res : The directory of xlsx original for "timestamp"
 * id_list : The list xlsx downloaded in mail.
 */
const input:string = "C:/Users/user/Documents/FTP/Scanned/export__/decrypt";
const res:string = "C:/Users/user/Documents/FTP/Scanned/export__/";
const id_list:string = "C:/Users/user/Documents/FTP/Scanned/export__/etc/20180328175607_문서등록대장목록_2.xlsx";
const output:string = "C:/Users/user/Documents/output.xlsx";
const added:string[] = [];
const ids:object[] = XlsxUtil.getXLSXTable(id_list,"asdf");

const xlsxlist:string[] = fs.readdirSync(input).map((v) => {return {
        name:v,
        time:fs.statSync(res + v).mtime.getTime(),
    };})
    .sort((a, b) => -1 * (a.time - b.time))
    .filter((v) => v.name.endsWith(".xlsx"))
    .map((v) => v.name);
/**
 * splice: force to put in position
 */
xlsxlist.splice(12,0,"exclude/자사제품 제조용 원료(식품등) 신고수리 내역(2018.3.12.~2018.3.16.).xlsx");
const dateOffset:Map<number,number> = new Map();
const dateOverride:Map<number,Date> = new Map();
/**
 * Generates date offset: Some document don't match (The day of mail -1)
 * ID: Document ID
 */
("11877 10936 10824 10823 9740 8973 8206 7825 7824 7786 7197 6398 6137 5902 5762 4437 4399 3506 3432 2573 2572 2288 1529 1374 1220 993 410 340")
.split(" ").forEach((v) => dateOffset.set(Number.parseInt(v),0));
("3874 2843 2630 2627 1658 1502 1501")
.split(" ").forEach((v) => dateOffset.set(Number.parseInt(v),2));
dateOffset.set(1680,3);
("8661 84 83")
.split(" ").forEach((v) => dateOffset.set(Number.parseInt(v),4));
dateOffset.set(6928,5);
dateOverride.set(26,new Date(2017,4 - 1,11,0));
("14 9 1")
.split(" ").forEach((v) => dateOverride.set(Number.parseInt(v),new Date(2017,4 - 1,11,0)));
/**
 * Mod any
 */
xlsxlist.forEach((value, i) => {
    if (!value.endsWith(".xlsx")) {
        return;
    }
    const id:object = ids[i];
    const docid:number = id["문서번호"];
    const doctime:number[] = id["보고일자"] != null ? id["보고일자"].split(".").map((_v) => Number.parseInt(_v)) : null;
    doctime[1] -= 1;
    if (id["문서구분"] === "생산") {
        return;
    }
    let date:Date;
    if (doctime == null) {
        date = null;
    } else if (dateOverride.has(docid)) {
        date = dateOverride.get(docid);
    } else if (dateOffset.has(docid)) {
        date = new Date(doctime[0],doctime[1],doctime[2]);
        date.setDate(date.getDate() - dateOffset.get(docid));
    } else {
        date = new Date(doctime[0],doctime[1],doctime[2]);
        do {
            date.setDate(date.getDate() - 1);
        }while (date.getDay() === 0 || date.getDay() === 6);
    }
    const v:object[] = XlsxUtil.getXLSXTable(input + "/" + value,"aa");
    console.log(input + "/" + value);
    const exp:object[] = v.filter((data,index) => {
        return data["수신기관"] != null && (data["수신기관"] as string).indexOf("천안시") >= 0; // false: 스킵
    }).map((data, index) => {
        const obj:object = {
            시행일자:date,
            시행번호:id["생산등록번호"] == null ? null : id["생산등록번호"].split("-")[1],
            수신기관:data["수신기관"],
            신고수리기관:data["신고수리기관"],
            접수번호:data["접수번호"],
            유통관리목적:getKeyRegex(data,/유통.*목적/igm,/수입.*용도/igm), // 유통관리목적
            수입화주_명칭:getKeyRegex(data,/수입.*명/igm), // "수입화주명"
            수입화주_업종:getKeyRegex(data,/수입.*업종/igm), // "수입화주업종"
            수입화주_소재지:getKeyRegex(data,/수입.*주소.*/igm), // "수입화주소재지"
            제조업체_명칭:getKeyRegex(data,/제조.*회사.*명/igm), // "제조회사명"
            제조업체_업종:getKeyRegex(data,/제조.*업종.*/igm),// data["제조업체업종"],
            제조업체_소재지:getKeyRegex(data,/제조.*주소.*/igm,/제조.*소재지.*/igm), // data["제조업체소재지"]
            한글제품명:getKeyRegex(data,/한글.*명.*/igm), // data["한글제품명"],
            영문제품명:getKeyRegex(data,/영문.*명.*/igm), // data["영문제품명"],
            품목:getKeyRegex(data,/품목/igm,/제품.*유형/igm),
            수량:data["수량"],
            수량단위:data["수량단위"],
        };
        obj["중량(KG)"] = getKeyRegex(data,/중량\([A-Za-z]+\)/igm);
        obj["금액(USD)"] = getKeyRegex(data,/금액.*/igm); // data["금액(USD)"];
        obj["입항일자"] = data["입항일자"];
        obj["확인내역_일시"] = null;
        obj["확인내역_결과"] = null;
        obj["확인내역_확인자"] = null;
        obj["파일 이름"] = value;
        obj["Debug"] = null;
        Object.entries(obj).forEach((nv,ni) => {
            const tag = nv[0];
            if (tag !== "확인내역_일시" && tag !== "확인내역_결과" && tag !== "확인내역_확인자" && tag !== "Debug") {
                if (nv[1] == null && obj["Debug"] == null) {
                    obj["Debug"] = JSON.stringify(data);
                }
            }
        });
        return obj;
    });
    if (exp != null && exp.length > 0) {
        added.push(value);
    }
    toFile.addCells(exp);
});
function getKeyRegex(data:object,...regexes:RegExp[]):any {
    const entries:Array<[string,any]> = Object.entries(data);
    for (const [key,value] of entries) {
        for (const regex of regexes) {
            if (key.match(regex)) {
                return value;
            }
        }
    }
    return null;
}
/**
 * Export to
 */
toFile.exportXLSX(output);
