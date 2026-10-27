# OBDX Development Factory

A web-based tool that turns requirements (prompts, BRDs, FSDs) into code for a bank's existing Oracle Banking Digital Experience (OBDX) application. It builds new screens or enhances existing ones across the full stack, using local or privately hosted AI models.

- Supports OBDX 22.x and 25.x
- Factory mode (one installation, many banks) and bank mode (installed inside one bank)
- Interactive screen designer with live previews that customers can review and approve
- Target-neutral screen models, so frontends can later be generated for React Native or React (modernization mode)
- Built with the OBDX team's own stack: Oracle JET, Java/Spring Boot, PostgreSQL, Maven, Jenkins, SVN
- Human review of spec, screen design, plan and code; output as an SVN branch or a patch that applies with TortoiseSVN

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture, requirements and roadmap.

## Quick start

```bash
mvn clean verify                                  # builds the JET UI and the Spring Boot server, runs tests
java -jar factory-server/target/obdx-factory.jar  # http://localhost:8080
```

Needs JDK 21, Maven and PostgreSQL with pgvector. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup, configuration and installation on a Linux server.
