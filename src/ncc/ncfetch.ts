import * as cheerio from "cheerio";
import * as encoding from "encoding";
import * as Entities from "html-entities";
import * as querystring from "querystring";
import * as request from "request-promise-native";
import Log from "../log";
import Article from "../structure/article";
import Cafe from "../structure/cafe";
import Comment from "../structure/comment";
import Profile from "../structure/profile";
import { cafePrefix, mCafePrefix, whitelistDig } from "./ncconstant";
import NcCredent from "./ncredent";
export default class NcFetch extends NcCredent {
    protected parser = new Entities.AllHtmlEntities();
    constructor() {
        super();
    }
    /**
     * Get Cheerio(jquery) object from url
     * @returns jQuery
     * @param requrl URL request
     * @param param get parameter
     * @param option convert to EUC-KR / use cookie for auth
     */
    public async getWeb(requrl:string, param:object, option = {conv:true,auth:true},
        post:object = null,referer:string = `${cafePrefix}/`):Promise<CheerioStatic> {
        /**
         * Check cookie status
         */
        const isNaver = new RegExp(/^(http|https):\/\/[A-Za-z0-9\.]*naver\.com\//, "gm").test(requrl);
        if (option.auth && (!isNaver || (!this.available && this.validateLogin() == null))) {
            Log.e("ncc-getWeb : Cookie is invaild");
            return Promise.reject();
        }
        /**
         * Copy tough-cookie to request-cookie
         */
        const cookie = request.jar();
        if (option.auth) {
            for (const url of ["https://nid.naver.com/", "https://naver.com"]) {
                await new Promise<void>((res, rej) => {
                    this.credit.cookieJar.getCookies(url, (err, cookies) => {
                        if (err) {
                            rej(err);
                        } else {
                            cookies.forEach((value) => {
                                cookie.setCookie(value.toString(), url);
                            });
                            res();
                        }
                    });
                });
            }
        }
        /**
         * form data modification
         */
        let post_body = null;
        if (post != null) {
            post_body = encoding.convert(
                querystring.stringify(post, "&", "=", { encodeURIComponent: (v) => v }), "utf-8");
        }
        /**
         * Make referer and options.
         */
        const options:request.RequestPromiseOptions | request.OptionsWithUrl = {
            method: post != null ? "POST" : "GET",
            url: requrl,
            qs: param,
            body: post_body,
            encoding: option.conv ? null : "utf-8",
            strictSSL: false,
            headers: {
                "Referer": referer,
                "content-type": post != null ? "application/x-www-form-urlencoded; charset=euc-kr" : undefined,
            },
            jar: option.auth ? cookie : false
        }
        const buffer:Buffer | string = await request(options);
        let body:string;
        /**
         * Naver cafe uses euc-kr f***.
         */
        if (option.conv) {
            body = encoding.convert(buffer, "utf-8", "ms949").toString();
        } else {
            body = buffer as string;
        }
        return Promise.resolve(cheerio.load(body));
    }
    /**
     * Parse naver info
     * @param purl cafe url
     */
    public async parseNaver(purl:string):Promise<Cafe> {
        const cut = purl.match(/^(http|https):\/\/cafe\.naver\.com\/[A-Za-z0-9]+\//i);
        if (cut != null) {
            purl = cut[0];
        }
        const $ = await this.getWeb(purl, {});
        const src = $("#main-area > script").html();
        const id = Number.parseInt(src.match(/clubid=[0-9]*/m)[0].split("=")[1]);
        /*
        const title = $($(".d-none").get(0)).text();
        let skipMobile = $("#u_skipToMobileweb").attr("href");
        skipMobile = skipMobile.substr(skipMobile.lastIndexOf("/") + 1);
        return Promise.resolve({
            cafeId: id,
            cafeName: skipMobile,
            cafeDesc: title,
        } as Cafe);
        */
        return this.parseNaverDetail(id);
    }
    public async parseNaverDetail(cafeid:number):Promise<Cafe> {
        const url = `${cafePrefix}/CafeProfileView.nhn?clubid=${cafeid.toString(10)}`;
        const $ = await this.getWeb(url, {});
        let members:string[] = $(".invite-padd02").map((index, element) => {
            const o = $(element);
            switch (index) {
                case 0:
                return o.text();
                case 1:
                return o.text();
                case 2:
                return o.find("img").length >= 1 ? o.find("img")[0].attribs["src"] : "";
                default:
                return null;
            }
        }).get();
        members = members.filter((_v) => _v != null);
        return Promise.resolve({
            cafeId: cafeid,
            cafeName: members[1].substr(members[1].lastIndexOf("/") + 1),
            cafeDesc: members[0].trim(),
            cafeImage: members[2].length <= 0 ? null : members[2],
        } as Cafe);
    }
    /**
     * Get recent articles (cookie X)
     * @param cafeid cafe id
     */
    public async getRecentArticles(cafeid:number):Promise<Article[]> {
        const articlesURL = `${cafePrefix}/ArticleList.nhn`;
        const params:object = {
            "search.clubid": cafeid.toString(),
            "search.boardtype": "L",
            "userDisplay": "5",
        };
        const $:any = await this.getWeb(articlesURL, params, {conv:true, auth:false});
        const articleList:Article[] = $('[name="ArticleList"] > table > tbody > tr:nth-child(2n+1)')
            .map((i, el) => { // console.log($(el).children('td:nth-child(3)').html());
                const clickscript:string = $(el).children("td:nth-child(3)").find(".m-tcol-c").attr("onclick");
                const arid:number = parseInt($(el).children("td:nth-child(1)").text(), 10);
                const cluburl = clickscript.split(",")[8].split("'")[1];
                return {
                    articleId: arid,
                    articleTitle: $(el).children("td:nth-child(2)").find(".m-tcol-c").text(),
                    userName: $(el).children("td:nth-child(3)").find(".m-tcol-c").text(),
                    url: `${cafePrefix}/${cluburl}/${arid}`,
                    userId: clickscript.split(",")[1].split("\'")[1],
                    flags: {
                        file: $(el).find(".list-i-upload").length > 0,
                        image: $(el).find(".list-i-img").length > 0,
                        video: $(el).find(".list-i-movie").length > 0,
                        question: $(el).find(".list-i-poll").length > 0,
                        vote: $(el).find(".ico-q").length > 0,
                    },
                    cafeId: cafeid,
                    cafeName: cluburl,
                } as Article;
            }).get();
        return Promise.resolve<Article[]>(articleList);
    }
    /**
     * get comments from article
     * @param cafeid cafe id
     * @param articleid  article id
     */
    public async getComments(cafeid:number, articleid:number, orderNew = true):Promise<Comment[]> {
        const commentURL = `${mCafePrefix}/CommentView.nhn`;
        const params:object = {
            "search.clubid": cafeid.toString(),
            "search.articleid": articleid.toString(),
            "search.orderby": orderNew ? "desc" : "asc",
        };
        const $:any = await this.getWeb(commentURL, params, {conv:false, auth:true});
        if ($ == null) {
            return Promise.reject("Error");
        }

        if ($("title").text().indexOf("로그인") >= 0) {
            Log.e("로그인이 안되어 있습니다.");
            return Promise.reject("로그인 안 됨");
        } else if ($(".error_content").length > 0) {
            Log.e($(".error_content_body h2").text());
            return Promise.reject($(".error_content_body h2").text());
        }
        // console.log( $('.u_cbox_comment').html());
        const comments:Comment[] = $(".u_cbox_comment").filter((i, el) => {
            return !$(el).hasClass("re");
        }).map((i, el) => {
            const author:any = $(el).find(".u_cbox_info_main").find("a");
            const reft:string = author.attr("href");
            const tstring:string = $(el).find(".u_cbox_date").text();

            const ymd:string[] = tstring.split(".");
            const hm:string[] = ymd[ymd.length - 1].split(":");

            let imgurl = null;
            if ($(el).find(".u_cbox_image_wrap").length >= 1) {
                imgurl = this.orgURI($(el).find(".u_cbox_image_wrap").find("a").attr("class")
                .match(/(http|https):\/\/.+\)/i)[0]);
            }

            let stickerurl = null;
            if ($(el).find(".u_cbox_sticker_wrap").length >= 1) {
                stickerurl = $(el).find(".u_cbox_sticker_wrap").find("a").find("img").attr("src");
            }

            let profileurl = null;
            if ($(el).find(".thumb").length >= 1) {
                profileurl = this.orgURI($(el).find(".thumb").find("img").attr("src"));
            }

            const time = {
                year: parseInt(ymd[0], 10),
                month: parseInt(ymd[1], 10) - 1,
                day: parseInt(ymd[2], 10),
                hour: parseInt(hm[0].substr(1), 10),
                minute: parseInt(hm[1], 10),
                offset: 3600 * 9 * 1000,
            };
            return {
                cafeId: cafeid,
                userid: reft.substring(reft.lastIndexOf("=") + 1),
                nickname: author.text(),
                content: $(el).find(".u_cbox_contents").text(),
                timestamp: new Date(time.year, time.month, time.day, time.hour, time.minute).getTime() - time.offset,
                imageurl: imgurl,
                stickerurl,
                profileurl,
            } as Comment;
        }).get();

        for (const comment of comments) {
            Log.json("Comment", comment);
        }
        return Promise.resolve<Comment[]>(comments);
        // https://m.cafe.naver.com/CommentView.nhn?search.clubid=#cafeID&search.articleid=#artiID&search.orderby=desc";
    }
    /**
     * get Article comment and content
     * @param cafeid cafe id
     * @param articleid article id
     */
    public async getArticleDetail(cafeid:number,articleid:number):Promise<Article> {
        const articleURL = `${cafePrefix}/ArticleRead.nhn`;
        const params:object = {
            "clubid": cafeid.toString(),
            "articleid": articleid.toString(),
        };
        const comments = await this.getComments(cafeid,articleid,false);
        const $ = await this.getWeb(articleURL, params);
        if ($ == null) {
            return Promise.reject("Error");
        }

        const infos = $(".etc-box .p-nick a").attr("onclick").split(",");
        const link = $(".etc-box #linkUrl").text();
        const title = $(".tit-box span").text();
        // parse article names
        const tbody = $("#tbody");
        const contents = [];
        const whitelist = ["img","iframe", "embed", "br"];
        tbody.children().map((i,el) => {
            const parsedContent = this.getTextsR(el, [])
            .filter((_el) => _el.data != null || whitelist.indexOf(_el.tagName) >= 0).map((value) => {
                if (whitelist.indexOf(value.tagName) >= 0) {
                    let type = "embed";
                    let data = value.attribs["src"];
                    if (value.tagName === "img") {
                        type = "image";
                    }else if (value.tagName === "br") {
                        type = "newline";
                        data = "br";
                    }
                    if (data == null) {
                        data = "";
                    }
                    return {type,data};
                } else {
                    return {type:"text",data:value.data};
                }
            })
            .filter((value) => (value.type !== "text") || (value.data.replace(/\s+/igm, "").length >= 1));
            parsedContent.forEach((value) => contents.push(value));
            if (i >= 1 && parsedContent.filter((value) => value.type === "newline").length <= 0) {
                contents.push({type: "newline", data: "div"});
            }
        });
        const images = contents.filter((value) => value.type === "image");
        let image = null;
        if (images.length >= 1) {
            image = images[0].data;
        }
        // name
        const _titles = this.parser.decode($("head").html()).match(/var cafeNameTitle =.+/ig);
        let titles:string = null;
        if (_titles != null && _titles.length >= 1) {
            titles = _titles[0].substring(_titles[0].indexOf('"') + 1,_titles[0].lastIndexOf('"'));
        }

        const out = {
            cafeId: Number.parseInt(this.querystr(infos[4])),
            cafeName: link.substring(link.indexOf("/") + 1, link.lastIndexOf("/")),
            cafeDesc: titles,
            articleId: Number.parseInt(link.substr(link.lastIndexOf("/") + 1)),
            articleTitle: title,
            flags: {
                file: false,
                image: images.length >= 1,
                video: false,
                question: false,
                vote: false,
            },
            userName: this.querystr(infos[3]),
            userId: this.querystr(infos[1]),
            url: link,
            comments,
            contents,
            imageURL: image,
        } as Article;
        return Promise.resolve(out);
        // https://cafe.naver.com/ArticleRead.nhn?clubid=26686242&
        // page=1&boardtype=L&articleid=7446&referrerAllArticles=true
    }
    public async getMemberPublic(cafeid:number, id:string, isNickname = true):Promise<Profile[]> {
        const url_params = {
            "keywordSearch.clubid": cafeid.toString(),
            "m": "listKeyword",
        }
        const post_params = {
            "keywordSearch.keywordType": isNickname ? 2 : 1,
            "keywordSearch.keyword": this.encodeURI_KR(id),
        }
        // need referer wow!
        const $ = await this.getWeb(
            `${cafePrefix}/CafeMemberAllViewIframe.nhn`, url_params, {conv:true, auth:true},
            post_params, `${cafePrefix}/CafeMemberAllViewIframe.nhn?m=listKeyword&defaultSearch.clubid=${cafeid}`);
        if ($ == null) {
            return Promise.reject("Error");
        }

        const members:Profile[] = [];
        if ($("#main-area").find(".mem_wrap").length >= 0) {
            const parser = ((i:number, el:CheerioElement) => {
                const profile = $(el).find(".thmb img").attr("src");
                const split = $(el).find(".txt_area a").attr("onclick").split(",");
                let profileU = null;
                if ($(el).find(".thmb").length >= 1) {
                    profileU = this.orgURI($(el).find(".thmb").find("img").attr("src"));
                }
                const out = {
                    profileurl: profileU,
                    nickname: this.querystr(split[3]),
                    userid: this.querystr(split[1]),
                    cafeId: cafeid,
                } as Profile;
                members.push(out);
                return out;
            }).bind(this);
            $("#main-area").find(".mem_list").map((i, el) => {
                $(el).children("div").map(parser).get();
            });
            for (let i = 0; i < members.length; i += 1) {
                members[i] = await this.getMemberPrivate(cafeid, members[i].userid);
            }
        }
        return Promise.resolve(members);
    }
    public async getMemberPrivate(cafeid:number,userid:string):Promise<Profile> {
        const paramLevel = {
            "m": "view",
            "clubid": cafeid.toString(10),
            "memberid": userid,
        }
        const $ = await this.getWeb(`${cafePrefix}/CafeMemberNetworkView.nhn`, paramLevel);
        const cafe = await this.parseNaverDetail(cafeid);
        if ($ == null) {
            return Promise.reject("Error");
        }
        let nick = $(".ellipsis").text();
        // userid = nick.substring(nick.indexOf("(") + 1, nick.indexOf(")"));
        nick = nick.substring(0,nick.indexOf("("));
        const image = $(".thumb").find("img").attr("src");
        const check = $(".m_info_area").find(".m-tcol-c");
        const level = $(check[0]).text().trim();
        const visit = Number.parseInt($(check[2]).find(".num").text());
        const article = Number.parseInt($(check[4]).find(".num").text());
        const comment = Number.parseInt($(check[6]).find(".num").text());
        return Promise.resolve({
            profileurl:image,
            nickname: nick,
            userid,
            cafeId:cafeid,
            cafeDesc: cafe.cafeDesc,
            cafeImage: cafe.cafeImage,
            cafeName: cafe.cafeName,
            numArticles:article,
            numVisits: visit,
            numComments : comment,
            level,
        } as Profile);
    }
    /**
     * Query string... at ('aa','bb','cc').split(",");
     * @param str string
     */
    private querystr(str:string):string {
        return str.substring(str.indexOf("'") + 1,str.lastIndexOf("'"));
    }
    /**
     * f*ck euc-kr, naver.
     * @param str 
     */
    private encodeURI_KR(str:string):string {
        return encoding.convert(str, "euc-kr").toString("hex").replace(/([a-f0-9]{2})/g, "%$1").toUpperCase()
    }
    private orgURI(str:string):string {
        if (str == null) {
            return null;
        }
        if (str.indexOf("?") >= 0) {
            str = str.substring(0, str.lastIndexOf("?"));
        }
        return decodeURI(str);
    }
    /**
     * get "no child" elements 
     * @param el $
     * @param arr init []
     */
    private getTextsR(el:CheerioElement,arr:CheerioElement[] = []):CheerioElement[] {
        if (el.children != null && el.children.length >= 1) {
            for (const _el of el.children) {
                if (whitelistDig.indexOf(el.tagName) >= 0) {
                    arr = this.getTextsR(_el, arr);
                }
            }
        } else {
            arr.push(el);
        }
        return arr;
    }
}