package net.tarks.craftingmod.nccauth;


import java.io.*;

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
}