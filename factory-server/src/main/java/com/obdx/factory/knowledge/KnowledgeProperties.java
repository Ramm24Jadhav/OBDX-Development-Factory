package com.obdx.factory.knowledge;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

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
 */
@ConfigurationProperties(prefix = "factory.knowledge")
public record KnowledgeProperties(
        @DefaultValue("false") boolean externalModels,
        @DefaultValue List<String> internalHosts,
        @DefaultValue("5") int answerSources,
        @DefaultValue("1000") int sourceChars,
        @DefaultValue("3000") int pageContextChars) {
}
