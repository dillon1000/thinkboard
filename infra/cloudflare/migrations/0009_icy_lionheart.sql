CREATE TABLE `flashcardReviewEvent` (
	`id` text PRIMARY KEY NOT NULL,
	`userID` text NOT NULL,
	`boardID` text NOT NULL,
	`reviewID` text NOT NULL,
	`rating` text NOT NULL,
	`intervalDays` integer NOT NULL,
	`easeFactor` real NOT NULL,
	`reviewedAt` integer NOT NULL,
	FOREIGN KEY (`userID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`boardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flashcardReviewEvent_userID_reviewedAt_idx` ON `flashcardReviewEvent` (`userID`,`reviewedAt`);--> statement-breakpoint
CREATE INDEX `flashcardReviewEvent_boardID_reviewedAt_idx` ON `flashcardReviewEvent` (`boardID`,`reviewedAt`);