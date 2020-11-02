import Knex from 'knex'
import { IDbConnectionServerConfig } from '../../src/lib/db/client'
import { createServer } from '../../src/lib/db/index'
export const dbtimeout = 120000

const KnexTypes: any = {
  postgresql: 'pg',
  'mysql': 'mysql2',
  "mariadb": "mysql2",
  "sqlite": "sqlite3",
  "sqlserver": "mssql",
  "cockroachdb": "pg"
}

interface Options {
  defaultSchema?: string
  version?: string
}

export class DBTestUtil {
  public knex: Knex
  public server: any
  public connection: any
  public expectedTables: number = 6
  public preInitCmd: string | undefined
  public defaultSchema: string | null = 'public'
  constructor(config: IDbConnectionServerConfig, database: string, options?: Options) {

    if (config.client === 'sqlite') {
      this.knex = Knex({
        client: "sqlite3",
        connection: {
          filename: database
        }
      })
    } else {
      this.knex = Knex({
        client: KnexTypes[config.client || ""] || config.client,
        version: options?.version,
        connection: {
          host: config.host,
          port: config.port || undefined,
          user: config.user || undefined,
          password: config.password || undefined,
          database,
        },
        pool: { min: 0, max: 50 }
      })
    }
    
    this.defaultSchema = options?.defaultSchema || this.defaultSchema
    this.server = createServer(config)
    this.connection = this.server.createConnection(database)
  }

  async setupdb() {
    await this.createTables()
    await this.connection.connect()
    const address = await this.knex("addresses").insert({country: "US"}).returning("id")
    const people = await this.knex("people").insert({ email: "foo@bar.com", address_id: address[0]}).returning("id")
    const jobs = await this.knex("jobs").insert({job_name: "Programmer"}).returning("id")
    await this.knex("people_jobs").insert({job_id: jobs[0], person_id: people[0] })
  }

  async testdb() {
    // SIMPLE TABLE CREATION TEST
    const tables = await this.connection.listTables({ schema: this.defaultSchema })
    expect(tables.length).toBe(this.expectedTables)
    const columns = await this.connection.listTableColumns("people", this.defaultSchema)
    expect(columns.length).toBe(7)

    // PRIMARY KEY TESTS
    // TODO: update this to support composite keys
    const pk = await this.connection.getPrimaryKey("people", this.defaultSchema)
    expect(pk).toBe("id")

    await this.tableViewTests()

  }

  /**
   * Tests related to the table view
   * fetching PK, selecting data, etc.
   */ 
  async tableViewTests() {
    // reserved word as table name
    expect(await this.connection.getPrimaryKey("group", this.defaultSchema))
      .toBe("id");
    
    const stR = await this.connection.selectTop("group", 0, 10, ["select"], null, this.defaultSchema)
    console.log("STR", stR)
    expect(stR)
      .toMatchObject({ result: [], totalRecords: 0 })
    
    await this.knex("group").insert([{select: "bar"}, {select: "abc"}])

    let r = await this.connection.selectTop("group", 0, 10, ["select"], null, this.defaultSchema)
    let result = r.result.map((r: any) => r.select)
    expect(result).toMatchObject(["abc", "bar"])

    r = await this.connection.selectTop("group", 0, 10, [{field: 'select', dir: 'desc'}], null, this.defaultSchema)
    result = r.result.map((r: any) => r.select)
    expect(result).toMatchObject(['bar', 'abc'])

    r = await this.connection.selectTop("group", 0, 1, [{ field: 'select', dir: 'desc' }], null, this.defaultSchema)
    result = r.result.map((r: any) => r.select)
    expect(result).toMatchObject(['bar'])

    r = await this.connection.selectTop("group", 1, 10, [{ field: 'select', dir: 'desc' }], null, this.defaultSchema)
    result = r.result.map((r: any) => r.select)
    expect(result).toMatchObject(['abc'])
    

    // composite primary key tests. Just disable them for now
    r = await this.connection.getPrimaryKey('with_composite_pk', this.defaultSchema)
    expect(r).toBeNull()
  }


  private async createTables() {

    await this.knex.schema.createTable('addresses', (table) => {
      table.increments().primary()
      table.timestamps()
      table.string("street")
      table.string("city")
      table.string("state")
      table.string("country").notNullable()
    })

    await this.knex.schema.createTable('group', (table) => {
      table.increments().primary()
      table.string("select")
    })

    await this.knex.schema.createTable("people", (table) => {
      table.increments().primary()
      table.timestamps()
      table.string("firstname")
      table.string("lastname")
      table.string("email").notNullable()
      table.integer("address_id").notNullable().unsigned()
      table.foreign("address_id").references("addresses.id")
    })

    await this.knex.schema.createTable("jobs", (table) => {
      table.increments().primary()
      table.timestamps()
      table.string("job_name").notNullable()
      table.decimal("hourly_rate")
    })

    await this.knex.schema.createTable("people_jobs", (table) => {
      table.integer("person_id").notNullable().unsigned()
      table.integer("job_id").notNullable().unsigned()
      table.foreign("person_id").references("people.id")
      table.foreign("job_id").references("jobs.id")
      table.primary(['person_id', "job_id"])
      table.timestamps()
    })

    await this.knex.schema.createTable('with_composite_pk', (table) => {
      table.integer("id1").notNullable().unsigned()
      table.integer("id2").notNullable().unsigned()
      table.primary(["id1", "id2"])
    })
  }
}