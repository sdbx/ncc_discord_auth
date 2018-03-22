import * as fetcher from "./fetcher";
import RouteConv from "./routeConv";
import Config from "./structure/config";

class Inner {
    public static main():number {
        console.log("hello world");
        return 0;
    }
}
Inner.main();
fetcher.getComments(26686242,7212);
fetcher.getArticles(26686242);
const cfg:Config = new Config();
cfg.import(true);

const conv:RouteConv = new RouteConv();
conv.getXLSX("C:/Users/user/Documents/FTP/Scanned/암호화해제/2018년 조기폐차 보조금 대상자 명단(최종확정).xlsx","asdf");
// cfg.export();
/*
fetcher.getWeb("http://cafe.naver.com/ArticleList.nhn", {
    'search.clubid':'26686242',
    'search.boardtype':'L'
})*/
