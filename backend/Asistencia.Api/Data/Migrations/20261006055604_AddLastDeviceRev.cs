using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asistencia.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddLastDeviceRev : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "last_device_rev",
                table: "class_sessions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "last_device_rev",
                table: "attendance_records",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "last_device_rev",
                table: "class_sessions");

            migrationBuilder.DropColumn(
                name: "last_device_rev",
                table: "attendance_records");
        }
    }
}
