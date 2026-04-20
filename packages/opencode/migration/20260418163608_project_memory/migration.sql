CREATE TABLE `compaction_index` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`content` text NOT NULL,
	`tokens` integer NOT NULL,
	`indexed_at` integer NOT NULL,
	CONSTRAINT `fk_compaction_index_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `project_memory` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`content` text NOT NULL,
	`tags` text NOT NULL,
	`source_session_id` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	`accessed_at` integer NOT NULL,
	CONSTRAINT `fk_project_memory_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `compaction_session_idx` ON `compaction_index` (`session_id`);--> statement-breakpoint
CREATE INDEX `memory_project_idx` ON `project_memory` (`project_id`);--> statement-breakpoint
CREATE INDEX `memory_session_idx` ON `project_memory` (`source_session_id`);