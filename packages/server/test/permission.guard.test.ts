import { Reflector } from '@nestjs/core'
import assert from 'assert'
import 'reflect-metadata'

import { PermissionGuard, PermissionScopeEnum } from '../src/common/guard/permission.guard'

function createGraphqlExecutionContext({
  handler,
  req,
  input
}: {
  handler: Function
  req: Record<string, any>
  input: Record<string, any>
}) {
  return {
    getType: () => 'graphql',
    getArgs: () => [{}, { input }, { req }, {}],
    getClass: () => class TestResolver {},
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => req
    })
  } as any
}

function createHttpExecutionContext({
  handler,
  req
}: {
  handler: Function
  req: Record<string, any>
}) {
  return {
    getType: () => 'http',
    getArgs: () => [],
    getClass: () => class TestController {},
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => req
    })
  } as any
}

function createGuard({
  team,
  member,
  project = null,
  projectMember = null,
  form = null
}: {
  team: Record<string, any> | null
  member: Record<string, any> | null
  project?: Record<string, any> | null
  projectMember?: Record<string, any> | null
  form?: Record<string, any> | null
}) {
  const teamService = {
    findById: async () => team,
    findMemberById: async () => member,
    updateMember: async () => true
  }

  const projectService = {
    findById: async () => project,
    findMemberById: async () => projectMember
  }

  const formService = {
    findById: async () => form
  }

  return new PermissionGuard(
    new Reflector(),
    teamService as any,
    projectService as any,
    formService as any
  )
}

async function testCollaboratorCanPassTeamGuard() {
  const handler = () => {}
  Reflect.defineMetadata('scope', PermissionScopeEnum.team, handler)

  const guard = createGuard({
    team: {
      id: 'team_1',
      ownerId: 'owner_1',
      name: 'Workspace A',
      storageQuota: 0,
      inviteCode: 'invite_1',
      toObject: () => ({})
    },
    member: {
      role: 'collaborator'
    }
  })

  const req: Record<string, any> = {
    user: {
      id: 'user_collaborator'
    }
  }

  const context = createGraphqlExecutionContext({
    handler,
    req,
    input: {
      teamId: 'team_1'
    }
  })

  const allowed = await guard.canActivate(context)

  assert.strictEqual(allowed, true)
  assert.strictEqual(req.team.isOwner, false)
  assert.strictEqual(req.team.id, 'team_1')
}

async function testNonMemberIsRejected() {
  const handler = () => {}
  Reflect.defineMetadata('scope', PermissionScopeEnum.team, handler)

  const guard = createGuard({
    team: {
      id: 'team_1',
      ownerId: 'owner_1',
      name: 'Workspace A',
      storageQuota: 0,
      inviteCode: 'invite_1',
      toObject: () => ({})
    },
    member: null
  })

  const req: Record<string, any> = {
    user: {
      id: 'user_not_in_team'
    }
  }

  const context = createGraphqlExecutionContext({
    handler,
    req,
    input: {
      teamId: 'team_1'
    }
  })

  await assert.rejects(
    async () => guard.canActivate(context),
    (error: any) => error?.message === "You don't have permission to access the workspace"
  )
}

async function testHttpFormGuardReadsRequestQuery() {
  const handler = () => {}
  Reflect.defineMetadata('scope', PermissionScopeEnum.form, handler)

  const guard = createGuard({
    team: {
      id: 'team_1',
      ownerId: 'owner_1',
      name: 'Workspace A',
      storageQuota: 0,
      inviteCode: 'invite_1',
      toObject: () => ({})
    },
    member: {
      role: 'collaborator'
    },
    project: {
      id: 'project_1',
      teamId: 'team_1',
      ownerId: 'owner_1',
      toObject: () => ({
        teamId: 'team_1',
        ownerId: 'owner_1'
      })
    },
    projectMember: {
      role: 'collaborator'
    },
    form: {
      teamId: 'team_1',
      projectId: 'project_1',
      toObject: () => ({
        teamId: 'team_1',
        projectId: 'project_1'
      })
    }
  })

  const req: Record<string, any> = {
    user: {
      id: 'user_collaborator'
    },
    query: {
      formId: 'form_1'
    },
    params: {}
  }

  const allowed = await guard.canActivate(createHttpExecutionContext({ handler, req }))

  assert.strictEqual(allowed, true)
  assert.strictEqual(req.form.id, 'form_1')
  assert.strictEqual(req.project.id, 'project_1')
  assert.strictEqual(req.team.id, 'team_1')
}

async function run() {
  await testCollaboratorCanPassTeamGuard()
  await testNonMemberIsRejected()
  await testHttpFormGuardReadsRequestQuery()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
