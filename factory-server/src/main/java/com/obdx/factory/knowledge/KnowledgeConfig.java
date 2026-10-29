package com.obdx.factory.knowledge;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class KnowledgeConfig {

    private final KnowledgeService knowledge;
    private final KnowledgeImporter importer;

    public KnowledgeConfig(@org.springframework.context.annotation.Lazy KnowledgeService knowledge,
                           @org.springframework.context.annotation.Lazy KnowledgeImporter importer) {
        this.knowledge = knowledge;
        this.importer = importer;
    }

    /** Reading and embedding manuals, one document at a time, apart from imports, changes and builds. */
    @Bean
    public TaskExecutor knowledgeExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("knowledge-");
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(1000);
        executor.setWaitForTasksToCompleteOnShutdown(false);
        executor.initialize();
        return executor;
    }

    /** New and edited notes become searchable by meaning within a couple of minutes. */
    @Scheduled(fixedDelayString = "PT2M", initialDelayString = "PT1M")
    public void embedNotes() {
        knowledge.embedNotes();
    }

    /** Watched folders are checked for new and changed documents (Oracle's updated manuals, the bank's own). */
    @Scheduled(fixedDelayString = "${factory.knowledge.folder-check-interval:PT6H}", initialDelayString = "PT10M")
    public void checkFolders() {
        importer.rescanAll();
    }
}
