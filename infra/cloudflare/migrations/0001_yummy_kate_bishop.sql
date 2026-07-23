CREATE TABLE `studyConversation` (
	`id` text PRIMARY KEY NOT NULL,
	`agentName` text NOT NULL,
	`boardID` text NOT NULL,
	`userID` text NOT NULL,
	`title` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`boardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studyConversation_agentName_unique` ON `studyConversation` (`agentName`);--> statement-breakpoint
CREATE INDEX `studyConversation_boardID_userID_updatedAt_idx` ON `studyConversation` (`boardID`,`userID`,`updatedAt`);