import * as cheerio from "cheerio";
import * as encoding from "encoding";
import * as Long from "long";
import * as request from "request-promise-native";
import Article from "./structure/article";
import Comment from "./structure/comment";

const articleURL:string = "http://cafe.naver.com/ArticleList.nhn";
const commentURL:string = "https://m.cafe.naver.com/CommentView.nhn";

async function getWeb(requrl:string, param:object, convert:boolean = false) {
    const buffer = await request({
        url: requrl,
        qs: param,
        encoding: null,
    });
    let body:string;
    if (convert) {
        body = encoding.convert(buffer, "utf-8","euc-kr").toString();
    } else {
        body = buffer;
    }
    return cheerio.load(body);
}
export async function getArticles(cafeid:number):Promise<Article[]> {
    const params:object = {
        "search.clubid":cafeid.toString(),
        "search.boardtype":"L",
        "userDisplay":"5",
    };
    const $:any = await getWeb(articleURL,params,true);

    const articleList:Article[] = $('[name="ArticleList"] > table > tbody > tr:nth-child(2n+1)')
    .map((i, el) => { // console.log($(el).children('td:nth-child(3)').html());
        const clickscript:string = $(el).children("td:nth-child(3)").find(".m-tcol-c").attr("onclick");
        const arid:number = parseInt($(el).children("td:nth-child(1)").text(),10);
        return new Article({
        id: arid,
        title: $(el).children("td:nth-child(2)").find(".m-tcol-c").text(),
        username: $(el).children("td:nth-child(3)").find(".m-tcol-c").text(),
        link: "http://cafe.naver.com/" + clickscript.split(",")[8].split("'")[1] + "/" + arid,
        userid: clickscript.split(",")[1].split("\'")[1],
        flags: Article.flag(
            $(el).find(".list-i-upload").length > 0,
            $(el).find(".list-i-img").length > 0,
            $(el).find(".list-i-movie").length > 0,
            $(el).find(".list-i-poll").length > 0,
            $(el).find(".ico-q").length > 0),
    });}).get();
    for (const article of articleList) {
        console.log(article.id + " / " + article.title + " / " + article.username + " / " + article.link + " / " + article.userid);
    }
    return Promise.resolve<Article[]>(articleList);
    /*
    return new Promise<Array<Article>>((resolve) => {
        resolve(articleList);
    });
    */
}
export async function getComments(cafeid:number,articleid:number):Promise<Comment[]> {
    const params:object = {
        "search.clubid":cafeid.toString(),
        "search.articleid":articleid.toString(),
        "search.orderby":"desc",
    };
    const $:any = await getWeb(commentURL,params);

    if ($("title").text().indexOf("로그인") >= 0) {
        console.log("네이버 게시물을 전체 공개로 해주세요.");
        return Promise.reject("Memeber_open");
    }
    // console.log( $('.u_cbox_comment').html());
    const comments:Comment[] = $(".u_cbox_comment").filter((i,el) => {
        return !$(el).hasClass("re");
    }).map((i,el) => {
        const author:any = $(el).find(".u_cbox_info_main").find("a");
        const reft:string = author.attr("href");
        const tstring:string = $(el).find(".u_cbox_date").text();

        const ymd:string[] = tstring.split(".");
        const hm:string[] = ymd[ymd.length - 1].split(":");

        const time:any = {
            year: parseInt(ymd[0], 10),
            month: parseInt(ymd[1], 10) - 1,
            day: parseInt(ymd[2], 10),
            hour: parseInt(hm[0].substr(1), 10),
            minute: parseInt(hm[1], 10),
            offset: 3600 * 9 * 1000,
        };
        return new Comment({
            userid: reft.substring(reft.lastIndexOf("=") + 1),
            nickname: author.text(),
            content: $(el).find(".u_cbox_contents").text(),
            timestamp: new Date(time.year,time.month,time.day,time.hour,time.minute).getTime() - time.offset,
        });
    }).get();

    for (const comment of comments) {
        console.log(comment.userid + " / " + comment.nickname + " / " + comment.content + " / " + comment.timestamp);
    }

    return Promise.resolve<Comment[]>(comments);
    // https://m.cafe.naver.com/CommentView.nhn?search.clubid=#cafeID&search.articleid=#artiID&search.orderby=desc";
}

export function genflag(input:number,...arg:boolean[]):number {
    const len = arg.length;
    for (const [i, flag] of Object.entries(arg)) {
        const offset:number = len - Number.parseInt(i) - 1;
        if (flag) {
            input |= (1 << offset);
        } else {
            input &= ~(1 << offset);
        }
    }
    return input;
}
