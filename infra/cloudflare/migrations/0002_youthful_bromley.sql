CREATE TABLE `flashcardReview` (
	`id` text PRIMARY KEY NOT NULL,
	`userID` text NOT NULL,
	`boardID` text NOT NULL,
	`shapeID` text NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`easeFactor` real DEFAULT 2.5 NOT NULL,
	`intervalDays` integer DEFAULT 0 NOT NULL,
	`repetition` integer DEFAULT 0 NOT NULL,
	`reviewCount` integer DEFAULT 0 NOT NULL,
	`nextReviewAt` integer NOT NULL,
	`lastReviewedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`boardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flashcardReview_userID_boardID_shapeID_unique` ON `flashcardReview` (`userID`,`boardID`,`shapeID`);--> statement-breakpoint
CREATE INDEX `flashcardReview_userID_nextReviewAt_idx` ON `flashcardReview` (`userID`,`nextReviewAt`);--> statement-breakpoint
CREATE TABLE `studyMistake` (
	`id` text PRIMARY KEY NOT NULL,
	`userID` text NOT NULL,
	`boardID` text NOT NULL,
	`concept` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`patternKey` text NOT NULL,
	`shapeIDs` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`boardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `studyMistake_userID_boardID_createdAt_idx` ON `studyMistake` (`userID`,`boardID`,`createdAt`);--> statement-breakpoint
CREATE INDEX `studyMistake_userID_patternKey_idx` ON `studyMistake` (`userID`,`patternKey`);