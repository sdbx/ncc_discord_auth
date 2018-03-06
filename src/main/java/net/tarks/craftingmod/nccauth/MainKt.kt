package net.tarks.craftingmod.nccauth

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.reflect.TypeToken
import com.google.gson.stream.JsonReader
import org.fusesource.jansi.AnsiConsole
import org.fusesource.jansi.Ansi.*
import java.io.File
import java.io.FileInputStream
import java.io.InputStreamReader
import java.nio.charset.Charset

fun main(args:Array<String>){
    AnsiConsole.systemInstall()
    val configF:File? = MainKt.getDefaultDIR().let {
        it?.resolve("config.json")
    }
    if(configF == null){
        ansi().run {
            fgBrightRed()
            a("Can't find root directory")
            reset()
            System.out.println(this)
        }
        return;
    }
    ansi().run {
        fgDefault()
        a("Config path: ${configF.absolutePath}, exist: ${configF.exists()}")
        System.out.println(this)
    }
    val cafeLink:String? = args.getOrNull(0)
    val main:MainKt = MainKt(configFile = configF,cafeLink = cafeLink)
}

class MainKt(val configFile:File,var cafeLink:String? = null) {
    companion object {
        fun getDefaultDIR():File? {
            val root:File? = Util.getRootdir()
            return if(root != null && root.canWrite() && root.canRead()){
                root
            }else{
                null
            }
        }
    }
    val g:Gson = GsonBuilder().create()
    var config:Config = Config("token","url")
    init {
        if(configFile.exists() && configFile.canRead()){
            val reader = JsonReader(InputStreamReader(FileInputStream(configFile), Charset.forName("utf-8")))
            config.copyFrom(g.fromJson<Config>(reader, object : TypeToken<Config>() {}.type))
        }else{
            if(configFile.parentFile.canWrite()){
            }
        }
        println("${configFile.absolutePath}")
    }
    fun initFromCafe(cafeURL:String) {

    }
}