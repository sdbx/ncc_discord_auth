import * as fs from "fs";
import * as fetcher from "./fetcher";
import Config from "./structure/config";
import XlsxUtil from "./xlsxutil";

const routes:XlsxUtil = new XlsxUtil();
const path:string = "C:/Users/user/Documents/FTP/Scanned/2018년 조기폐차 보조금 제외자 명단.xlsx";
const list:object[] = XlsxUtil.getXLSXTable(path);
routes.addCells(list.filter((v) => v["주소"] != null).map((row,index) => {
    const out:object = {};
    out["시도"] = "";
    const route:string = row["주소"];
    let modRoute:string = route;
    const city:string = getMatch(route,/\S+(시|군)(\s\S+구|)/igm);
    modRoute = removeSafety(modRoute,city);

    let village:string = getMatch(route,/[가-힣]+(동|읍|면)/igm);
    if (village != null) {
        const ps_dong:number = village.indexOf("동");
        if (village.endsWith("동") && ps_dong >= 0 && ps_dong < village.length - 1) {
            village = village.substr(0,ps_dong + 1);
        }
        // village = getMatch(route,/[가-힣]+(동|읍|면)(?![가-힣])/igm);
    }
    console.log(village);
    const _tempRoute = removeSafety(modRoute,village);

    let way:string = getMatch(_tempRoute, /[\S]+(길|로)/igm);
    if (way != null) {
        if (way.replace(/\d+(길|로)/igm,"").length === 0) {
            way = getMatch(_tempRoute, /[\S\s]+(길|로)/igm);
        }
    }

    // check exception of dong
    if (village != null && way != null && route.indexOf(way) < route.indexOf(village)) {
        // village position is larger than way
        // if village matches space
        let altVillage:string = getMatch(route,new RegExp("" + village + "(?![가-힣0-9])","igm"));
        if (altVillage != null) {
            altVillage = altVillage.trim();
        }
        village = altVillage; // Exception: 극동1ㅏ아파트
    }
    // let way:string = getMatch(modRoute, /[\S\s]+(길|로)/igm);
    modRoute = removeSafety(modRoute,village);
    modRoute = removeSafety(modRoute,way);
    // trim way
    if (way != null) {
        way = way.replace(/[\s]+/igm,"");
    }

    let old_route:string = getMatch(modRoute,/\S+(리|가)\s/igm);
    modRoute = removeSafety(modRoute,old_route);
    if (old_route != null) {
        old_route = old_route.trimRight();
    }
    let mountain:string = getMatch(modRoute, /\s(산)\s/igm);
    modRoute = removeSafety(modRoute,mountain);
    if (mountain != null) {
        mountain = mountain.trim();
    }
    let routeNum_old:string = getMatch(modRoute, /[\d]+번지(\s*\d+호|)/igm);
    modRoute = removeSafety(modRoute,routeNum_old);
    if (routeNum_old != null) {
        const arr:RegExpMatchArray = routeNum_old.match(/\d+/igm);
        if (arr.length >= 2) {
            routeNum_old = arr[0] + "-" + arr[1];
        } else {
            routeNum_old = arr[0].match(/[\d]+/igm)[0];
        }
    }
    let detail_room:string = getMatch(modRoute,/([\d]{1,6}\s*동).*[\d]{1,6}\s*호/igm);
    modRoute = removeSafety(modRoute,detail_room);
    if (detail_room != null) {
        detail_room = detail_room.replace(/[\s]+/igm,"").replace("동","동 ");
    }

    let routeNum:string = routeNum_old;
    const xypair:RegExpMatchArray = modRoute.match(/[\d]{1,5}[\s]*-[\s]*[\d]{1,5}/igm);
    const firstDigit:string = getMatch(modRoute,/[\d]+/igm);
    if (xypair != null) {
        let _pair:string[];
        if (xypair.length >= 2) {
            // There is two pair
            _pair = xypair[1].split("-");
            routeNum = xypair[0];
            if (detail_room === null) {
                detail_room = _pair[0] + "동 " + _pair[1] + "호";
            }
        } else {
            // Discuss...
            _pair = xypair[0].split("-");
            if (_pair[0] === firstDigit) {
                // only xxx-xxx exists and matches first
                if (routeNum_old == null) {
                    routeNum = xypair[0];
                }
            } else {
                // number provided by int, pair provided by pair
                if (routeNum_old != null) {
                    // routeNum_old provided and append
                    if (routeNum_old.indexOf("-") < 0) {
                        routeNum = routeNum_old + "-" + firstDigit;
                    }
                } else {
                    routeNum = firstDigit;
                }
                if (detail_room === null) {
                    detail_room = _pair[0] + "동 " + _pair[1] + "호";
                }
            }
        }
    } else if (firstDigit != null) {
        // only number provided.
        // copy and paste
        if (routeNum_old != null) {
            // routeNum_old provided and append
            if (routeNum_old.indexOf("-") < 0) {
                routeNum = routeNum_old + "-" + firstDigit;
            }
        } else {
            routeNum = firstDigit;
        }
    } else {
        // nope.
        console.error("Error in " + route);
    }
    // trim route
    if (routeNum != null) {
        routeNum = routeNum.replace(/[\s]+/igm,"");
    }
    if (xypair != null) {
        for (const remove of xypair) {
            modRoute = removeSafety(modRoute,remove);
        }
    }
    modRoute = removeSafety(modRoute,firstDigit);
    // fix dong and ho
    let pattern = getMatch(modRoute,/[\d]+동\s*[\d]+/igm);
    if (pattern != null) {
        detail_room = pattern.split("동")[0] + "동 " + pattern.split("동")[1] + "호";
    }
    pattern = getMatch(modRoute,/[\d]+호/igm);
    modRoute = removeSafety(modRoute,pattern);
    if (pattern != null) {
        detail_room = pattern.match(/\d+/igm)[0];
    }
    modRoute = removeSafety(modRoute,pattern);

    let exception:string = null;

    if (routeNum == null || (old_route == null && way == null)) {
        exception = "F";
    }

    return {
        결과:exception,
        시도:null,
        시군구:city,
        읍면동:village,
        리:old_route,
        산:mountain,
        길:way,
        지번:routeNum,
        상세주소:detail_room,
        기타주소:modRoute,
        주소:route,
    };
}),"main");
routes.exportXLSX("C:/Users/user/Documents/out2.xlsx");
function removeSafety(str:string,...rep:string[]) {
    let out:string = str;
    for (const loop of rep) {
        if (loop != null) {
            out = out.replace(loop, "");
        }
    }
    return out;
}
function getMatch(str:string,reg:RegExp):string {
    const arr:RegExpMatchArray = str.match(reg);
    if (arr != null && arr.length >= 1) {
        return arr[0];
    } else {
        return null;
    }
}
