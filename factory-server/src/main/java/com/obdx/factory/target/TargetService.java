package com.obdx.factory.target;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.design.ScreenModel;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Which UI technology a workspace generates screens for, and where its new app lives. With the jet target (default)
 * the factory enhances the bank's OBDX UI; with react-native or react it builds screens of a new app in the app folder,
 * on the same OBDX services.
 */
@Service
public class TargetService {

    private static final Pattern FOLDER = Pattern.compile("[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*");

    public record PackSummary(String id, String title, String description, String preview, String defaultAppFolder,
                              Map<String, String> structure, Map<String, TargetPack.ComponentMapping> components, int starterFiles) {
    }

    /**
     * @param appFolderExists whether the imported code already has the app (its package.json); if not, the starter
     *                        project should be committed there first
     */
    public record WorkspaceTarget(String target, String title, String preview, String appFolder, boolean appFolderExists) {
    }

    public record TargetRequest(String target, String appFolder) {
    }

    /** A file the factory would generate for a screen design, with its path in the repository. */
    public record CodeFile(String path, String kind, String content) {
    }

    private final TargetPacks packs;
    private final WorkspaceRepository workspaces;
    private final StorageProperties storage;

    public TargetService(TargetPacks packs, WorkspaceRepository workspaces, StorageProperties storage) {
        this.packs = packs;
        this.workspaces = workspaces;
        this.storage = storage;
    }

    public List<PackSummary> list() {
        return packs.all().stream().map(p -> new PackSummary(p.id(), p.title(), p.description(), p.preview(), p.defaultAppFolder(),
                p.structure(), p.components(), p.starter().size())).toList();
    }

    public TargetPack pack(String id) {
        return packs.find(id).orElseThrow(() -> new NotFoundException("No target pack " + id));
    }

    @Transactional(readOnly = true)
    public WorkspaceTarget get(UUID workspaceId) {
        Workspace workspace = workspace(workspaceId);
        TargetPack pack = packs.find(workspace.getTarget()).orElse(packs.jet());
        return new WorkspaceTarget(pack.id(), pack.title(), pack.preview(), workspace.getAppFolder(), appExists(workspace));
    }

    @Transactional
    public WorkspaceTarget update(UUID workspaceId, TargetRequest request) {
        Workspace workspace = workspace(workspaceId);
        TargetPack pack = pack(request.target() == null || request.target().isBlank() ? TargetPack.JET : request.target());
        String folder = null;
        if (!pack.isJet()) {
            folder = request.appFolder() == null || request.appFolder().isBlank() ? pack.defaultAppFolder()
                    : request.appFolder().strip().replace('\\', '/').replaceAll("^/+|/+$", "");
            if (folder == null || !FOLDER.matcher(folder).matches() || folder.contains("..")) {
                throw new BadRequestException("The app folder must be a relative path in the repository, for example mobile or apps/mobile");
            }
        }
        workspace.setTarget(pack.id(), folder);
        workspaces.save(workspace);
        return get(workspaceId);
    }

    /** The starter project of a pack as a zip, to commit as the app folder. */
    public byte[] starterZip(String targetId) {
        TargetPack pack = pack(targetId);
        if (pack.starter().isEmpty()) {
            throw new BadRequestException("The " + pack.title() + " target has no starter project");
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (Map.Entry<String, String> file : pack.starter().entrySet()) {
                zip.putNextEntry(new ZipEntry(file.getKey()));
                zip.write(file.getValue().getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return bytes.toByteArray();
    }

    /**
     * The starting points generated from one Screen Model for the workspace's React Native or React app: screen, test
     * and texts. The designer shows them; code generation starts from the same files.
     */
    @Transactional(readOnly = true)
    public List<CodeFile> code(UUID workspaceId, ScreenModel model, String module) {
        Workspace workspace = workspace(workspaceId);
        TargetPack pack = packs.find(workspace.getTarget()).orElse(packs.jet());
        if (pack.isJet() || workspace.getAppFolder() == null) {
            throw new BadRequestException("Code previews are for React Native and React targets; this workspace enhances the OBDX JET UI");
        }
        String folder = module == null || module.isBlank() ? "app" : module.toLowerCase().replaceAll("[^a-z0-9_-]", "");
        String app = workspace.getAppFolder() + "/";
        String screenPath = ScreenScaffolder.screenPath(pack, model, folder);
        String testPath = pack.structure().get("test").replace("{module}", folder).replace("{Screen}", ScreenScaffolder.pascal(model.name()));
        String textsPath = pack.structure().get("texts");
        return List.of(
                new CodeFile(app + screenPath, "screen", ScreenScaffolder.screen(pack, model, folder).content()),
                new CodeFile(app + testPath, "test", ScreenScaffolder.test(pack, model).content()),
                new CodeFile(app + textsPath, "texts", ScreenScaffolder.texts(pack.starter().getOrDefault(textsPath, "{}"), List.of(model))));
    }

    /** What the planner needs to know about the target, or an empty string for the jet target. */
    @Transactional(readOnly = true)
    public String planGuide(UUID workspaceId) {
        Workspace workspace = workspace(workspaceId);
        TargetPack pack = packs.find(workspace.getTarget()).orElse(packs.jet());
        if (pack.isJet() || workspace.getAppFolder() == null) {
            return "";
        }
        String app = workspace.getAppFolder() + "/";
        StringBuilder guide = new StringBuilder();
        guide.append("The screens of this requirement are built in a new ").append(pack.title()).append(" app in the folder ")
                .append(app).append(" of the repository, not in the OBDX JET UI. Do not plan changes to JET views or view models.\n");
        if (!appExists(workspace)) {
            guide.append("The app folder has no starter project yet; plan the screen files anyway (the starter project is committed separately).\n");
        }
        guide.append("For each approved screen design plan these files (layer ui), with {module} a lowercase module folder:\n");
        for (String kind : List.of("screen", "test", "api", "texts", "navigation")) {
            guide.append("- ").append(kind).append(": ").append(app).append(pack.structure().get(kind))
                    .append(kind.equals("texts") || kind.equals("navigation") ? " (modify; create only if it does not exist)" : "").append('\n');
        }
        guide.append("{Screen} is the design's name in PascalCase (for example \"Fund Transfer\" gives FundTransfer).\n");
        guide.append("Change OBDX backend services only when the requirement needs new service behavior; the app calls the existing OBDX REST services.\n");
        return guide.toString();
    }

    /** Whether the app's package.json is in the imported code. */
    boolean appExists(Workspace workspace) {
        return workspace.getAppFolder() != null
                && Files.isRegularFile(storage.workingCopy(workspace.getId()).resolve(workspace.getAppFolder()).resolve("package.json"));
    }

    private Workspace workspace(UUID id) {
        return workspaces.findById(id).orElseThrow(() -> new NotFoundException("Workspace not found: " + id));
    }
}
