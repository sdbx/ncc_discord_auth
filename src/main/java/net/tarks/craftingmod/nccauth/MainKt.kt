package net.tarks.craftingmod.nccauth

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.reflect.TypeToken
import com.google.gson.stream.JsonReader
import org.fusesource.jansi.AnsiConsole
import org.fusesource.jansi.Ansi.*
import org.jsoup.HttpStatusException
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import java.io.File
import java.io.FileInputStream
import java.io.InputStreamReader
import java.net.SocketTimeoutException
import java.nio.charset.Charset

fun main(args:Array<String>){
    AnsiConsole.systemInstall()
    //System.setProperty("jsse.enableSNIExtension", "false")
    val configF:File? = MainKt.getDefaultDIR().let {
        it?.resolve("config.json")
    }
    if(configF == null){
        ansi().run {
            fgBrightRed()
            a("Can't find root directory")
            reset()
            println(this)
        }
        return;
    }
    ansi().run {
        fgDefault()
        a("Config path: ${configF.absolutePath}, exist: ${configF.exists()}")
        println(this)
    }
    val cafeLink:String? = args.getOrNull(0)
    val main:MainKt = MainKt(configFile = configF,cafeLink = cafeLink)
}

class MainKt(val configFile:File,val cafeLink:String? = null) {
    companion object {
        fun getDefaultDIR():File? {
            val root:File? = Util.getRootdir()
            return if(root != null && root.canWrite() && root.canRead()){
                root
            }else{
                null
            }
        }
        fun getNaverConfig(cafeURL:String):ConfigKt {
            var out:ConfigKt = ConfigKt("Please type discord bot token here.","Cafe URL..")
            val doc:Document? = getUrlDOM(cafeURL)
            if(doc == null || doc.title().contains("로그인") || doc.getElementsByClass("error_content_body").size >= 1){
                println(ansi().fgBrightRed().a("네이버 게시물을 전체 공개로 해주세요.").reset())
                return out
            }
            val es = doc.getElementsByAttributeValue("name", "articleDeleteFrm")
            out.apply {
                cafeID = es.getOrNull(0)?.getElementsByAttributeValue("name","clubid")?.getOrNull(0)?.attr("value")?.toLongOrNull() ?: -1
                articleID = es.getOrNull(0)?.getElementsByAttributeValue("name","articleid")?.getOrNull(0)?.attr("value")?.toLongOrNull() ?: -1
                cafeCommentURL = cafeURL
            }
            if(out.cafeID < 0 || out.articleID < 0){
                println(ansi().fgBrightRed().a("URL $cafeURL 파싱 실패!").reset())
            }
            return out
        }
        fun getUrlDOM(url:String):Document? =
                try{
                    Jsoup.connect(url).apply {
                        header("User-Agent","Mozilla/5.0 (Android 7.0; Mobile; rv:54.0) Gecko/54.0 Firefox/54.0")
                        header("Referer","https://m.cafe.naver.com/")
                        timeout(10000)
                    }.get()
                }catch (e1:HttpStatusException) {
                    null
                }catch (e2:SocketTimeoutException){
                    null
                }
    }
    val g:Gson = GsonBuilder().create()
    var config:Config = Config("token","url")

    init {
        if(configFile.exists() && configFile.canRead()){
            val reader = JsonReader(InputStreamReader(FileInputStream(configFile), Charset.forName("utf-8")))
            config.copyFrom(g.fromJson<Config>(reader, object : TypeToken<Config>() {}.type))
        }else{
            if(configFile.parentFile.canWrite() && cafeLink != null) {
                config = getNaverConfig(cafeLink)
                ansi().apply {
                    bgDefault()
                    fgBrightRed()
                    a("######################")
                    println(this)
                }
                if(config.cafeID >= 0L && config.articleID >= 0L){
                    Util.write(configFile, Util.getJsonPretty(g.toJson(config)))
                }
            }
        }
        println("${configFile.absolutePath}")
    }
}