import assert from 'assert'

import { TeamRoleEnum } from '../src/model/team-member.model'
import { AddProjectMemberResolver } from '../src/resolver/project/add-project-member.resolver'
import { DeleteProjectMemberResolver } from '../src/resolver/project/delete-project-member.resolver'
import { UseTemplateResolver } from '../src/resolver/template/use-template.resolver'

async function testUseTemplateOnlyLoadsPublishedTemplates() {
  let created: Record<string, any> | undefined
  let requestedTemplateId: string | undefined
  const formService = {
    create: async (form: Record<string, any>) => {
      created = form
      return 'new_form'
    }
  }
  const templateService = {
    findPublishedById: async (templateId: string) => {
      requestedTemplateId = templateId
      return {
        id: templateId,
        name: 'Published template',
        kind: 1,
        interactiveMode: 1,
        fields: [{ id: 'field_1', kind: 'short_text' }],
        themeSettings: {}
      }
    }
  }
  const resolver = new UseTemplateResolver(formService as any, templateService as any)

  const formId = await resolver.useTemplate({ id: 'team_1' } as any, { id: 'user_1' } as any, {
    projectId: 'project_1',
    templateId: 'template_1'
  })

  assert.strictEqual(formId, 'new_form')
  assert.strictEqual(requestedTemplateId, 'template_1')
  assert.strictEqual(created?.teamId, 'team_1')
  assert.deepStrictEqual(JSON.parse(created?._drafts), [{ id: 'field_1', kind: 'short_text' }])

  templateService.findPublishedById = async () => null
  await assert.rejects(
    () =>
      resolver.useTemplate({ id: 'team_1' } as any, { id: 'user_1' } as any, {
        projectId: 'project_1',
        templateId: 'private_form_id'
      }),
    /template does not exist/
  )
}

async function testOnlyManagersCanAddProjectMembers() {
  let createdMember: Record<string, any> | undefined
  const projectService = {
    findMemberById: async () => null,
    createMember: async (member: Record<string, any>) => {
      createdMember = member
      return true
    }
  }
  const teamService = {
    findMemberById: async (_teamId: string, memberId: string) =>
      memberId === 'team_member' ? { memberId } : null
  }
  const resolver = new AddProjectMemberResolver(projectService as any, teamService as any)

  await assert.rejects(
    () =>
      resolver.addProjectMember(
        { id: 'team_1', isOwner: false, role: TeamRoleEnum.COLLABORATOR } as any,
        { id: 'project_1', isOwner: false } as any,
        { projectId: 'project_1', memberId: 'team_member' }
      ),
    /permission to manage project members/
  )
  await assert.rejects(
    () =>
      resolver.addProjectMember(
        { id: 'team_1', isOwner: true } as any,
        { id: 'project_1', isOwner: false } as any,
        { projectId: 'project_1', memberId: 'external_member' }
      ),
    /does not belong to this workspace/
  )

  await resolver.addProjectMember(
    { id: 'team_1', isOwner: false, role: TeamRoleEnum.ADMIN } as any,
    { id: 'project_1', isOwner: false } as any,
    { projectId: 'project_1', memberId: 'team_member' }
  )
  assert.deepStrictEqual(createdMember, {
    projectId: 'project_1',
    memberId: 'team_member'
  })
}

async function testOnlyManagersCanDeleteNonOwners() {
  let deletedMemberId: string | undefined
  const resolver = new DeleteProjectMemberResolver({
    deleteMember: async (_projectId: string, memberId: string) => {
      deletedMemberId = memberId
      return true
    }
  } as any)

  await assert.rejects(
    () =>
      resolver.deleteProjectMember(
        {
          ownerId: 'team_owner',
          isOwner: false,
          role: TeamRoleEnum.COLLABORATOR
        } as any,
        { ownerId: 'project_owner', isOwner: false } as any,
        { projectId: 'project_1', memberId: 'member_1' }
      ),
    /permission to manage project members/
  )
  await assert.rejects(
    () =>
      resolver.deleteProjectMember(
        { ownerId: 'team_owner', isOwner: true } as any,
        { ownerId: 'project_owner', isOwner: false } as any,
        { projectId: 'project_1', memberId: 'project_owner' }
      ),
    /permission to remove member/
  )

  await resolver.deleteProjectMember(
    { ownerId: 'team_owner', isOwner: true } as any,
    { ownerId: 'project_owner', isOwner: false } as any,
    { projectId: 'project_1', memberId: 'member_1' }
  )
  assert.strictEqual(deletedMemberId, 'member_1')
}

async function run() {
  await testUseTemplateOnlyLoadsPublishedTemplates()
  await testOnlyManagersCanAddProjectMembers()
  await testOnlyManagersCanDeleteNonOwners()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
