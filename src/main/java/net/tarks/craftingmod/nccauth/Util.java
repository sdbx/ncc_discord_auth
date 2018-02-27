package net.tarks.craftingmod.nccauth;


import java.io.*;
import java.security.CodeSource;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

public class Util {
    /**
     * http://egloos.zum.com/aploit/v/4422890
     */
    public static String getJsonPretty(String jsonString) {
        final String INDENT = "    ";
        StringBuffer prettyJsonSb = new StringBuffer();
        int indentDepth = 0;
        String targetString = null;
        for(int i=0; i<jsonString.length(); i++) {
            targetString = jsonString.substring(i, i+1);
            if(targetString.equals("{")||targetString.equals("[")) {
                prettyJsonSb.append(targetString).append("\n");
                indentDepth++;
                for(int j=0; j<indentDepth; j++) {
                    prettyJsonSb.append(INDENT);
                }
            }
            else if(targetString.equals("}")||targetString.equals("]")) {
                prettyJsonSb.append("\n");
                indentDepth--;
                for(int j=0; j<indentDepth; j++) {
                    prettyJsonSb.append(INDENT);
                }
                prettyJsonSb.append(targetString);
            }
            else if(targetString.equals(",")) {
                prettyJsonSb.append(targetString);
                prettyJsonSb.append("\n");
                for(int j=0; j<indentDepth; j++) {
                    prettyJsonSb.append(INDENT);
                }
            }
            else {
                prettyJsonSb.append(targetString);
            }
        }

        return prettyJsonSb.toString();
    }

    public static void write(File file, String content) {
        Writer out;
        if(!file.getParentFile().canWrite()){
            return;
        }
        try {
            out = new BufferedWriter(new OutputStreamWriter(
                    new FileOutputStream(file), "UTF-8"));
            out.write(content);
            out.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public static File getRootdir() {
        try{
            CodeSource codeSource = Main.class.getProtectionDomain().getCodeSource();
            File jarFile = new File(codeSource.getLocation().toURI().getPath());
            String jarDir = jarFile.getParentFile().getPath();
            return new File(jarDir);
        }catch (Exception e){
            return null;
        }
    }
    public static <T, E> Set<T> getKeysByValue(Map<T, E> map, E value) {
        return map.entrySet()
                .stream()
                .filter(entry -> Objects.equals(entry.getValue(), value))
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());
    }
}