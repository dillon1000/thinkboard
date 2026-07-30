CREATE TABLE `examPlan` (
	`id` text PRIMARY KEY NOT NULL,
	`userID` text NOT NULL,
	`title` text NOT NULL,
	`examDate` text NOT NULL,
	`boardIDs` text NOT NULL,
	`documentIDs` text NOT NULL,
	`primaryBoardID` text NOT NULL,
	`practiceSet` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`primaryBoardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `examPlan_userID_examDate_idx` ON `examPlan` (`userID`,`examDate`);--> statement-breakpoint
CREATE TABLE `studyArtifact` (
	`boardID` text NOT NULL,
	`shapeID` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`payload` text NOT NULL,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`boardID`, `shapeID`),
	FOREIGN KEY (`boardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `studyArtifact_boardID_kind_idx` ON `studyArtifact` (`boardID`,`kind`);