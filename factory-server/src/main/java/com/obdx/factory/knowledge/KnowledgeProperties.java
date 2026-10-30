package com.obdx.factory.knowledge;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import org.springframework.util.unit.DataSize;

import java.time.Duration;
import java.util.List;

/**
 * The knowledge base's limits and who may receive its content.
 *
 * @param externalModels    true: the knowledge (manual excerpts, the bank's documents, notes) may go to model servers
 *                          outside the bank's network too. Default false: only to servers on this computer, on private
 *                          addresses, or listed in internalHosts; others are refused and generation runs without it.
 * @param internalHosts     model server host names that belong to the bank although they resolve to public addresses,
 *                          exact (llm.bank.com) or a domain with a leading dot (.bank.com)
 * @param answerSources     sections and notes sent with a question
 * @param sourceChars       characters of each of them
 * @param pageContextChars  characters of the page the user is looking at. The defaults fit a 4k-token model; raise
 *                          them for models with a larger context
 * @param oracle            getting Oracle's manuals from its documentation site
 */
@ConfigurationProperties(prefix = "factory.knowledge")
public record KnowledgeProperties(
        @DefaultValue("false") boolean externalModels,
        @DefaultValue List<String> internalHosts,
        @DefaultValue("5") int answerSources,
        @DefaultValue("1000") int sourceChars,
        @DefaultValue("3000") int pageContextChars,
        @DefaultValue Oracle oracle) {

    /**
     * Oracle's manuals straight from Oracle's documentation site, for the OBDX versions an administrator follows.
     * Nothing is fetched until a version is followed.
     *
     * @param enabled       false: the factory never contacts Oracle's site (manuals come from folders and uploads)
     * @param indexUrl      Oracle's documentation index that lists the OBDX releases
     * @param hosts         the only hosts the factory fetches from (HTTPS)
     * @param checkInterval how often the followed manuals are checked for new patchsets and fixes
     * @param maxFileSize   larger files are refused
     * @param pause         the wait between two requests, so a check never loads Oracle's site or the bank's connection
     */
    public record Oracle(
            @DefaultValue("true") boolean enabled,
            @DefaultValue("https://www.oracle.com/technical-resources/documentation/fsgbu.html") String indexUrl,
            @DefaultValue({"docs.oracle.com", "www.oracle.com"}) List<String> hosts,
            @DefaultValue("P7D") Duration checkInterval,
            @DefaultValue("150MB") DataSize maxFileSize,
            @DefaultValue("PT2S") Duration pause) {
    }
}
