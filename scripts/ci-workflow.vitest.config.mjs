// The configuration of the step « Check this workflow » alone (server/ciWorkflow.test.ts), so that nothing
// that check reads runs before it: not vitest.config.ts, whose text it compares with the one it lists before
// anything loads it (a setupFiles, a globalSetup or an exit listener added there would otherwise run first
// and could end the step with success), nor a workspace file (vitest.workspace.*), which `projects` set here
// leaves unread. The step compares the digest of this file with the one ci.yml writes before vitest loads it:
// a change of it is a change of ci.yml. CODE-14.
export default {
  test: {
    projects: [
      {
        test: {
          name: "ci-workflow",
          include: ["server/ciWorkflow.test.ts"],
          environment: "node",
        },
      },
    ],
  },
};
