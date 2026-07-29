CREATE TABLE `agentProfile` (
	`userID` text PRIMARY KEY NOT NULL,
	`personality` text DEFAULT 'balanced' NOT NULL,
	`customPersonality` text DEFAULT '' NOT NULL,
	`customInstructions` text DEFAULT '' NOT NULL,
	`aboutUser` text DEFAULT '' NOT NULL,
	`includeMemories` integer DEFAULT true NOT NULL,
	`includeAboutUser` integer DEFAULT true NOT NULL,
	`includeCustomInstructions` integer DEFAULT true NOT NULL,
	`includeBoardContext` integer DEFAULT true NOT NULL,
	`includeConnectedServices` integer DEFAULT true NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_studyMistake` (
	`id` text PRIMARY KEY NOT NULL,
	`userID` text NOT NULL,
	`boardID` text,
	`concept` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`kind` text DEFAULT 'learning-pattern' NOT NULL,
	`patternKey` text NOT NULL,
	`shapeIDs` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`boardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_studyMistake`("id", "userID", "boardID", "concept", "title", "description", "kind", "patternKey", "shapeIDs", "createdAt") SELECT "id", "userID", "boardID", "concept", "title", "description", "kind", "patternKey", "shapeIDs", "createdAt" FROM `studyMistake`;--> statement-breakpoint
DROP TABLE `studyMistake`;--> statement-breakpoint
ALTER TABLE `__new_studyMistake` RENAME TO `studyMistake`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `studyMistake_userID_boardID_createdAt_idx` ON `studyMistake` (`userID`,`boardID`,`createdAt`);--> statement-breakpoint
CREATE INDEX `studyMistake_userID_patternKey_idx` ON `studyMistake` (`userID`,`patternKey`);