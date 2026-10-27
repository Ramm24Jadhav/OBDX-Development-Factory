package com.obdx.factory.indexing;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Builds the text used for keyword search. Code identifiers are split into words so that a search for
 * "fund transfer" finds FundTransferService, fund_transfer and fund-transfer.
 */
public final class SearchText {

    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z][A-Za-z0-9_$-]{2,}");
    private static final Pattern CAMEL_BOUNDARY = Pattern.compile("(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_$-]+");

    private SearchText() {
    }

    public static String build(String path, String symbol, String content) {
        StringBuilder text = new StringBuilder();
        text.append(path.replace('/', ' ').replace('.', ' ')).append('\n');
        if (symbol != null) {
            text.append(symbol).append('\n');
        }
        text.append(content).append('\n');
        text.append(String.join(" ", splitIdentifiers(path + " " + (symbol == null ? "" : symbol) + " " + content)));
        return text.toString();
    }

    /** The distinct lower-case words inside identifiers, for example "getFundTransferDTO" gives get, fund, transfer, dto. */
    public static Set<String> splitIdentifiers(String text) {
        Set<String> words = new LinkedHashSet<>();
        Matcher matcher = IDENTIFIER.matcher(text);
        while (matcher.find()) {
            String identifier = matcher.group();
            String[] parts = CAMEL_BOUNDARY.split(identifier);
            if (parts.length > 1) {
                for (String part : parts) {
                    if (part.length() > 1) {
                        words.add(part.toLowerCase(Locale.ROOT));
                    }
                }
            }
        }
        return words;
    }
}
