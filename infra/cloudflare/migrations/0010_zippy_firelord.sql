CREATE TABLE `agentAction` (
	`id` text PRIMARY KEY NOT NULL,
	`boardID` text NOT NULL,
	`userID` text NOT NULL,
	`conversationID` text,
	`toolName` text NOT NULL,
	`planID` text,
	`baseDocumentClock` integer,
	`recordIDs` text NOT NULL,
	`beforeRecords` text NOT NULL,
	`afterRecords` text NOT NULL,
	`status` text DEFAULT 'accepted' NOT NULL,
	`createdAt` integer NOT NULL,
	`undoStartedAt` integer,
	`undoneAt` integer,
	FOREIGN KEY (`boardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agentAction_boardID_createdAt_idx` ON `agentAction` (`boardID`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agentAction_userID_createdAt_idx` ON `agentAction` (`userID`,`createdAt`);