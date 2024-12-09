#!/usr/bin/env perl

use strict;
use warnings;

sub process_file
{
    my ( $tsv_file, $stats_file, $release ) = @_;

    open( my $tsv_fh, '<', $tsv_file ) or die "Could not open '$tsv_file': $!";
    chomp( my $header_line = <$tsv_fh> );
    close $tsv_fh;

    my @headers = split(/\t/, $header_line);

    open( my $stats_fh, '<', $stats_file ) or die "Could not open '$stats_file': $!";
    my %data_map;

    $data_map{ 'release' } = $release;

    while ( <$stats_fh> )
    {
        chomp;
        $data_map{ $1 } = $2 if ( /^(\w+)=(.+)$/ );
    }
    close $stats_fh;

    my @output_line;
    for my $header ( @headers )
    {
        push @output_line, exists $data_map{$header} ? $data_map{$header} : '';
    }

    open( my $tsv_fh_out, '>>', $tsv_file ) or die "Could not open '$tsv_file' for appending: $!";
    print $tsv_fh_out join( "\t", @output_line ), "\n";
    close $tsv_fh_out;
}

if ( $ARGV[0] eq '' )
{
    print "Usage: $0 <release-id>\n";
    exit 1;
}

my $release = $ARGV[0];

my $p = 'aws s3 cp s3://commoncrawl/projects/hyperlinkgraph';
my @commands = (
    "$p/$release/host/$release-host.stats cache/host/ ",
    "$p/$release/domain/$release-domain.stats cache/domain/ "
);

for my $command ( @commands )
{
    system($command) == 0 or die "Command failed: $command\n";
}

my $hostfile   = '../docs/host.tsv';
my $domainfile = '../docs/domain.tsv';
my $host_stats = 'cache/host/' . $release . '-host.stats';
my $domain_stats = 'cache/domain/' . $release . '-domain.stats';

process_file( $hostfile, $host_stats, $release );
process_file( $domainfile, $domain_stats, $release );

1;
