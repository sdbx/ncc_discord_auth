package net.tarks.craftingmod.nccauth

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import org.fusesource.jansi.AnsiConsole
import org.fusesource.jansi.Ansi.*
import java.io.File

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
        return
    }
    ansi().run {
        fgDefault()
        a("Config path: ${configF.absolutePath}, exist: ${configF.exists()}")
        System.out.println(this)
    }

    val main:MainKt = MainKt(configPath = configF)
}

class MainKt(val configPath:File, val cafeLink:String? = null) {
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
    init {
        println("${configPath.absolutePath}")
    }
}