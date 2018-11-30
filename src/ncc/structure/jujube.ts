/**
 * [DaldalSo](https://jjo.kr/) jujube open-source implemention.
 * 
 * This parts key of `jujube-code`.
 * 
 * Please replace $dot$ to . and _ to -
 */
export enum JujubeKey {
    /**
     * @name div
     * @requires `c, l, r, j` (center, left, right, justify)
     */
    text_align = "A",
    /**
     * @name span
     * @requires `{n}`px
     */
    line_height = "Fl",
    /**
     * @name span
     * @requires `{n}`px
     */
    font_size = "Fi",
    /**
     * @name span
     * @requires `{string}`
     */
    font_family = "Ff",
    /**
     * @name span
     * @requires `{n}`px
     */
    letter_spacing = "Fs",
    /**
     * @name span
     * @requires `{color hex}`
     */
    color = "Fc",
    /**
     * @name span
     * @requires `u, s` (underline, line-through)
     * 
     * As same as text_decoration_line
     */
    text_decoration_line = "Ft",
    /**
     * @name span
     * @requires `b` (bold)
     * 
     * As same as text_decoration_line
     */
    font_weight = "Ft",
    /**
     * @name span
     * @requires `{color hex}`
     */
    background_color = "Fk",
    /**
     * @name span
     * @requires `{idk param}`
     * 
     * [w3school](https://www.w3schools.com/cssref/css3_pr_text-shadow.asp)
     */
    text_shadow = "Fw",
    /**
     * @name span
     * @requires `i` (italic)
     * 
     * As same as text_decoration_line
     */
    font_style = "Ft",
    /**
     * @name table
     */
    $dot$equality = "Te",
    /**
     * @name table
     * @requires `{n}`px
     */
    border_spacing = "Ts",
    /**
     * @name table
     */
    $dot$collapsed = "Tc",
    
}