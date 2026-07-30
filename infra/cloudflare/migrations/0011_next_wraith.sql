CREATE TABLE `flashcardAnswerAttempt` (
	`id` text PRIMARY KEY NOT NULL,
	`userID` text NOT NULL,
	`boardID` text NOT NULL,
	`shapeID` text NOT NULL,
	`reviewID` text,
	`reviewCountAtAttempt` integer,
	`front` text NOT NULL,
	`primaryAnswer` text NOT NULL,
	`alternateAnswers` text NOT NULL,
	`submittedAnswer` text,
	`originalVerdict` text NOT NULL,
	`finalVerdict` text,
	`gradingMethod` text NOT NULL,
	`matchedAnswer` text,
	`feedback` text,
	`model` text,
	`rating` text,
	`createdAt` integer NOT NULL,
	`completedAt` integer,
	FOREIGN KEY (`userID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`boardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flashcardAnswerAttempt_userID_createdAt_idx` ON `flashcardAnswerAttempt` (`userID`,`createdAt`);--> statement-breakpoint
CREATE INDEX `flashcardAnswerAttempt_boardID_shapeID_idx` ON `flashcardAnswerAttempt` (`boardID`,`shapeID`);--> statement-breakpoint
ALTER TABLE `flashcardReview` ADD `alternateAnswers` text DEFAULT '[]' NOT NULL;