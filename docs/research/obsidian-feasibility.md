# Obsidian integration: feasibility discussion

16 September 2026. The owner initially requested feasibility discussion, then accepted the shared-vault recommendation and explicitly requested implementation. A first shared-file workflow is now implemented in local preview 0.3.11. See [implementation and evaluation boundaries](../obsidian-vaults.md) and [the 0.4 milestone](../0.4-plan.md). The earlier statement that the owner does not use Obsidian is historical; current usage has not been reconfirmed.

## Confirmed evidence

- Obsidian's [terms](https://obsidian.md/terms), checked today, reserve ownership and restrict redistribution and modification of the software. We should not plan to package the actual Obsidian application or its code inside LMBook under the ordinary user licence. A separately negotiated embedding agreement would need its own review. This is a product feasibility constraint, not a definitive legal opinion on every possible arrangement.
- Obsidian's [storage documentation](https://github.com/obsidianmd/obsidian-help/blob/master/en/Files%20and%20folders/How%20Obsidian%20stores%20data.md) describes a vault of ordinary Markdown files and observes external file changes. This provides a practical interoperability boundary.
- Its [URI protocol](https://obsidian.md/help/uri) supports actions such as opening and creating notes. This is a way to connect applications; it does not embed Obsidian's editor.
- The official [Vault plugin API](https://docs.obsidian.md/Plugins/Vault) exposes note reading and writing from an Obsidian plugin. A plugin is hosted inside Obsidian; the documented API is not a standalone embeddable Obsidian application.

## Credible approaches

1. **Optional shared vault with a notes workspace in LMBook.** Choose a vault folder, navigate/edit its Markdown files in LMBook, resolve supported links and attachments, select notes as learning sources, and write reviewed learning outputs back. Obsidian can open the same files. We build and maintain the editor ourselves. Wiki links, backlinks, tags, properties and graph views are feasible individual features, not an automatic consequence of reading Markdown.
2. **LMBook companion plugin inside Obsidian.** Let Obsidian provide its real editor, graph, Canvas and installed plugin environment; add commands or a learning panel that talks to LMBook. This best fits a requirement for actual Obsidian functionality, but places part of the workflow in Obsidian. Desktop/local-backend connection, installation and mobile support need separate design.
3. **Embed the actual application.** No supported public embedding route was established from the documentation reviewed. The licence and application integration would need agreement with Obsidian. OS window reparenting or copying application bundles is not a supportable cross-platform product plan.

Recommendation for discussion: the first approach fits an independent LMBook with notes and learning together. Choose the second if existing Obsidian plugins and its exact editing environment are central. Do not market either as complete plugin compatibility or complete Obsidian replacement.

## Consequential failure cases

Two apps editing the same note must not silently overwrite one another. A source snapshot used in an existing lesson must remain inspectable after its live note changes. File renames, duplicate note names, heading/block links, frontmatter, attachments and plugin-specific syntax need explicit compatibility rules. Preserve unsupported content instead of stripping it on save. Vault integration should remain optional, and source selection must remain explicit. Opening a vault does not imply sending every note to a model. Obsidian Sync compatibility would mean working with local files that Obsidian itself syncs; no implementation of its hosted sync service is proposed.

Owner clarification: someone with an existing Obsidian vault must be able to bring it into LMBook, generate summaries and other learning outputs, and edit/create files from LMBook that also appear in Obsidian. They proposed embedding the exact app especially to retain plugins, then accepted LMBook's own editor over shared files. This confirms bidirectional shared-file use, not a one-time copied import. The basic connected-vault workflow is implemented; plugin compatibility remains an explicit open question. Next discussion: which plugins or plugin-produced content must work inside LMBook, versus continuing to work in the separately installed Obsidian app?
